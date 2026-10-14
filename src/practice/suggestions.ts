// Transparent, rule-based suggestions. Each one cites the measurement that triggered it.
// The thresholds are rules of thumb for conversational English, not verdicts.

import type { PracticeMode, SessionMetrics } from '../sessions/types';

export interface Suggestion {
  title: string;
  evidence: string;
  /** Practice mode that targets this. */
  drill: PracticeMode;
  drillText: string;
}

const MIN_VOICED_SEC = 8;

export function suggest(m: SessionMetrics, max = 2): Suggestion[] {
  const out: Suggestion[] = [];
  const p = m.pitch;

  if (p && m.voicedSec >= MIN_VOICED_SEC && p.stdSemitones < 1.8) {
    out.push({
      title: 'Add more pitch movement on key words',
      evidence: `${Math.round(p.nearMedianFraction * 100)}% of your voiced time stayed within ±1.5 semitones of your median, and pitch varied by ${p.stdSemitones.toFixed(1)} st (std dev).`,
      drill: 'pitch',
      drillText: 'Try Pitch variation: read the same passage as a question, then as a confident statement, and compare the contours.',
    });
  }

  const wpm = m.rate?.wpmSpeaking ?? null;
  if (wpm !== null && wpm > 175) {
    out.push({
      title: 'Slow down slightly and add phrase pauses',
      evidence: `Estimated speaking rate was ${Math.round(wpm)} words per minute (pauses excluded). Many audiences follow 120–170 comfortably.`,
      drill: 'cadence',
      drillText: 'Try Pause & cadence: pause briefly at each marked phrase boundary.',
    });
  } else if (wpm !== null && wpm < 100 && m.speakingSec >= MIN_VOICED_SEC) {
    out.push({
      title: 'Keep phrases moving',
      evidence: `Estimated speaking rate was ${Math.round(wpm)} words per minute while speaking.`,
      drill: 'cadence',
      drillText: 'Try Pause & cadence and aim to join words within a phrase, pausing only at the markers.',
    });
  }

  const f = m.fillers;
  if (f && f.per100 !== null && f.per100 >= 4) {
    out.push({
      title: 'Replace fillers with a short silent pause',
      evidence: `${f.total} filler${f.total === 1 ? '' : 's'} detected, about ${f.per100.toFixed(1)} per 100 words. Recognition often omits "um/uh", so the true count may be higher.`,
      drill: 'presentation',
      drillText: 'Try Presentation practice and consciously pause instead of filling the gap.',
    });
  }

  const ps = m.pauseStats;
  if (m.speakingSec >= 20 && ps.count === 0) {
    out.push({
      title: 'Give listeners places to breathe',
      evidence: 'No pauses of 0.3 s or longer were detected between phrases.',
      drill: 'cadence',
      drillText: 'Try Pause & cadence to rehearse deliberate phrase breaks.',
    });
  } else if (ps.longCount >= 3) {
    out.push({
      title: 'Check your longer pauses',
      evidence: `${ps.longCount} pauses lasted 1 second or more (longest ${ps.longestSec.toFixed(1)} s). Long pauses can be effective for emphasis, but several in a short talk may be hesitation.`,
      drill: 'presentation',
      drillText: 'Re-run a timed Presentation and note which pauses were intentional.',
    });
  }

  if (out.length === 0) {
    out.push({
      title: 'No standout issue in these measurements',
      evidence: 'Pitch movement, pace and pauses were all within typical ranges, or there was not enough speech to judge.',
      drill: 'pitch',
      drillText: 'To keep improving, record the same passage with a different intention and compare attempts.',
    });
  }
  return out.slice(0, max);
}
