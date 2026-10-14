// Pitch-range statistics. Definitions are fixed (and versioned via METRICS_VERSION in
// sessions/metrics.ts) so sessions stay comparable.
//
// "Range" here is the 5th-95th percentile spread in semitones, which ignores the odd
// tracking glitch. Raw min/max are reported separately.

import { isValidFreq } from './notes';

export interface PitchBand {
  label: string;
  /** Share of voiced time, 0..1. */
  fraction: number;
}

export interface PitchSummary {
  voicedFrames: number;
  minHz: number;
  maxHz: number;
  medianHz: number;
  p5Hz: number;
  p95Hz: number;
  /** Full min -> max span in semitones. */
  fullRangeSemitones: number;
  /** p5 -> p95 span in semitones (the headline "pitch range"). */
  rangeSemitones: number;
  /** Standard deviation of pitch in semitones. */
  stdSemitones: number;
  /** Share of voiced time within +/-1.5 semitones of the median. */
  nearMedianFraction: number;
  bands: PitchBand[];
}

export function percentile(sorted: ArrayLike<number>, q: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  const pos = Math.min(1, Math.max(0, q)) * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function semitoneSpan(lowHz: number, highHz: number): number {
  if (!isValidFreq(lowHz) || !isValidFreq(highHz)) return 0;
  return 12 * Math.log2(highHz / lowHz);
}

const BAND_EDGES = [-4, -2, -1, 1, 2, 4];
const BAND_LABELS = [
  'More than 4 st below median',
  '2–4 st below',
  '1–2 st below',
  'Within ±1 st of median',
  '1–2 st above',
  '2–4 st above',
  'More than 4 st above median',
];

/** Summarise a list of F0 values (Hz). Invalid values (0, NaN, negative) are ignored. Null when none remain. */
export function summarizePitch(f0: ArrayLike<number>): PitchSummary | null {
  const hz: number[] = [];
  for (let i = 0; i < f0.length; i++) if (isValidFreq(f0[i])) hz.push(f0[i]);
  if (hz.length === 0) return null;
  hz.sort((a, b) => a - b);

  const medianHz = percentile(hz, 0.5);
  const p5Hz = percentile(hz, 0.05);
  const p95Hz = percentile(hz, 0.95);
  const st = hz.map((f) => 12 * Math.log2(f / medianHz));
  const mean = st.reduce((a, b) => a + b, 0) / st.length;
  const variance = st.reduce((a, b) => a + (b - mean) ** 2, 0) / st.length;

  const counts = new Array<number>(BAND_LABELS.length).fill(0);
  let near = 0;
  for (const s of st) {
    let b = 0;
    while (b < BAND_EDGES.length && s >= BAND_EDGES[b]) b++;
    counts[b]++;
    if (Math.abs(s) <= 1.5) near++;
  }

  return {
    voicedFrames: hz.length,
    minHz: hz[0],
    maxHz: hz[hz.length - 1],
    medianHz,
    p5Hz,
    p95Hz,
    fullRangeSemitones: semitoneSpan(hz[0], hz[hz.length - 1]),
    rangeSemitones: semitoneSpan(p5Hz, p95Hz),
    stdSemitones: Math.sqrt(variance),
    nearMedianFraction: near / hz.length,
    bands: BAND_LABELS.map((label, i) => ({ label, fraction: counts[i] / hz.length })),
  };
}
