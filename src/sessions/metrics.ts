// Session metric aggregation. All definitions live here so every session is measured the
// same way; bump METRICS_VERSION if any definition changes.

import { FLAG_ACTIVE, type Contour } from '../audio/frameLog';
import { summarizePitch } from '../pitch/stats';
import { summarizeFillers } from '../speech/fillers';
import type { TranscriptSegment } from '../speech/recognition';
import { buildSegments, pauseStats, type Segment } from '../speech/vad';
import type { PaceSample, RateMetrics, SessionMetrics } from './types';

export const METRICS_VERSION = 1;
const PACE_WINDOW_SEC = 15;
const MIN_SPEAKING_FOR_RATE_SEC = 3;

export interface MetricsOptions {
  /** Defaults to the end of the contour. */
  durationSec?: number;
  transcript?: TranscriptSegment[] | null;
  fillerList: string[];
  /** If set and there is no transcript, speaking rate is estimated from this word count. */
  passageWordCount?: number;
}

function frameDt(t: ArrayLike<number>, i: number): number {
  return i + 1 < t.length ? Math.min(t[i + 1] - t[i], 0.1) : 0.025;
}

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

export function paceSeries(
  transcript: TranscriptSegment[],
  segments: Segment[],
  durationSec: number,
): PaceSample[] {
  const out: PaceSample[] = [];
  for (let w0 = 0; w0 < durationSec; w0 += PACE_WINDOW_SEC) {
    const w1 = w0 + PACE_WINDOW_SEC;
    let words = 0;
    for (const seg of transcript) {
      if (seg.t >= w0 && seg.t < w1) words += seg.text.split(/\s+/).filter(Boolean).length;
    }
    const speaking = segments.reduce((a, s) => a + overlap(s.startSec, s.endSec, w0, w1), 0);
    if (speaking >= MIN_SPEAKING_FOR_RATE_SEC) out.push({ t: w0, wpm: (words / speaking) * 60 });
  }
  return out;
}

export function computeMetrics(c: Contour, opts: MetricsOptions): SessionMetrics {
  const n = c.t.length;
  const durationSec = opts.durationSec ?? (n ? c.t[n - 1] + 0.025 : 0);

  const active: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) active[i] = (c.flags[i] & FLAG_ACTIVE) !== 0;
  const { segments, pauses } = buildSegments(c.t, active);
  const speakingSec = segments.reduce((a, s) => a + (s.endSec - s.startSec), 0);

  let voicedSec = 0;
  const voicedF0: number[] = [];
  const levelsDb: number[] = [];
  for (let i = 0; i < n; i++) {
    if (c.f0[i] > 0) {
      voicedSec += frameDt(c.t, i);
      voicedF0.push(c.f0[i]);
    }
    if (active[i] && c.rms[i] > 0) levelsDb.push(20 * Math.log10(c.rms[i]));
  }

  let loudness = null;
  if (levelsDb.length >= 10) {
    const mean = levelsDb.reduce((a, b) => a + b, 0) / levelsDb.length;
    const v = levelsDb.reduce((a, b) => a + (b - mean) ** 2, 0) / levelsDb.length;
    loudness = { variationDb: Math.sqrt(v) };
  }

  const transcript = opts.transcript ?? null;
  const text = transcript ? transcript.map((s) => s.text).join(' ') : '';
  const fillers = text.trim() ? summarizeFillers(text, opts.fillerList) : null;

  let rate: RateMetrics | null = null;
  const enough = speakingSec >= MIN_SPEAKING_FOR_RATE_SEC;
  if (fillers && fillers.wordCount > 0) {
    rate = {
      words: fillers.wordCount,
      wpmSpeaking: enough ? (fillers.wordCount / speakingSec) * 60 : null,
      wpmOverall: durationSec > 0 ? (fillers.wordCount / durationSec) * 60 : null,
      source: 'transcript',
      paceSeries: transcript ? paceSeries(transcript, segments, durationSec) : [],
    };
  } else if (opts.passageWordCount && opts.passageWordCount > 0) {
    rate = {
      words: opts.passageWordCount,
      wpmSpeaking: enough ? (opts.passageWordCount / speakingSec) * 60 : null,
      wpmOverall: durationSec > 0 ? (opts.passageWordCount / durationSec) * 60 : null,
      source: 'passage',
      paceSeries: [],
    };
  }

  return {
    version: METRICS_VERSION,
    durationSec,
    speakingSec,
    voicedSec,
    pitch: summarizePitch(voicedF0),
    segments,
    pauses,
    pauseStats: pauseStats(pauses, durationSec),
    rate,
    fillers,
    loudness,
  };
}
