// Compare actual pauses against a passage's suggested phrase boundaries.
//
// Positions are compared as fractions of the way through the passage: for the passage,
// words before the boundary / total words; for the recording, speaking time before the pause /
// total speaking time. That assumes a roughly even pace, so the tolerance is deliberately loose.

import type { Pause, Segment } from '../speech/vad';

export const CADENCE_TOLERANCE = 0.08;

export interface CadenceResult {
  suggested: number;
  matched: number;
  /** Pauses that did not line up with any suggested boundary. */
  extra: number;
  /** Per suggested boundary: whether a pause landed near it. */
  perBoundary: boolean[];
}

function speakingBefore(segments: Segment[], time: number): number {
  return segments.reduce((a, s) => a + Math.max(0, Math.min(s.endSec, time) - s.startSec), 0);
}

export function matchPauses(
  suggestedFractions: number[],
  pauses: Pause[],
  segments: Segment[],
  tolerance = CADENCE_TOLERANCE,
): CadenceResult {
  const total = segments.reduce((a, s) => a + (s.endSec - s.startSec), 0);
  const actual = total > 0 ? pauses.map((p) => speakingBefore(segments, p.startSec) / total) : [];
  const used = new Set<number>();
  const perBoundary = suggestedFractions.map((f) => {
    let best = -1;
    let bestDist = tolerance;
    actual.forEach((a, i) => {
      const d = Math.abs(a - f);
      if (!used.has(i) && d <= bestDist) {
        best = i;
        bestDist = d;
      }
    });
    if (best >= 0) used.add(best);
    return best >= 0;
  });
  return {
    suggested: suggestedFractions.length,
    matched: perBoundary.filter(Boolean).length,
    extra: actual.length - used.size,
    perBoundary,
  };
}
