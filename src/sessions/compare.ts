// Side-by-side comparison of two sessions. Rows report numbers and differences only; they
// do not rank attempts, because "more pitch variation" or "faster" is not inherently better.

import type { SessionMeta } from './types';

export interface CompareRow {
  key: string;
  label: string;
  unit: string;
  a: number | null;
  b: number | null;
  /** b - a, or null if either side is missing. */
  delta: number | null;
  /** Optional neutral hint about how to read the row. */
  hint?: string;
}

function row(key: string, label: string, unit: string, a: number | null | undefined, b: number | null | undefined, hint?: string): CompareRow {
  const av = a ?? null;
  const bv = b ?? null;
  return { key, label, unit, a: av, b: bv, delta: av !== null && bv !== null ? bv - av : null, hint };
}

export function compareSessions(a: SessionMeta, b: SessionMeta): CompareRow[] {
  const ma = a.metrics;
  const mb = b.metrics;
  return [
    row('duration', 'Duration', 's', ma.durationSec, mb.durationSec),
    row('median', 'Median pitch', 'Hz', ma.pitch?.medianHz, mb.pitch?.medianHz),
    row('range', 'Pitch range (5th–95th pct)', 'st', ma.pitch?.rangeSemitones, mb.pitch?.rangeSemitones, 'Wider is not automatically better.'),
    row('std', 'Pitch variation (std dev)', 'st', ma.pitch?.stdSemitones, mb.pitch?.stdSemitones),
    row('wpm', 'Speaking rate', 'wpm', ma.rate?.wpmSpeaking, mb.rate?.wpmSpeaking, 'Pauses excluded.'),
    row('pauses', 'Pauses per minute', '/min', ma.pauseStats.perMinute, mb.pauseStats.perMinute),
    row('longPauses', 'Long pauses (≥1 s)', '', ma.pauseStats.longCount, mb.pauseStats.longCount),
    row('fillers', 'Fillers per 100 words', '', ma.fillers?.per100, mb.fillers?.per100, 'Needs a transcript of 30+ words.'),
  ];
}

/** Pick a sensible default comparison partner: most recent other session of the same passage, else same mode. */
export function suggestComparison(target: SessionMeta, all: SessionMeta[]): SessionMeta | null {
  const others = all.filter((s) => s.id !== target.id).sort((x, y) => y.createdAt - x.createdAt);
  return (
    others.find((s) => target.passageId && s.passageId === target.passageId) ??
    others.find((s) => s.mode === target.mode) ??
    null
  );
}
