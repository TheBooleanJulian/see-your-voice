// Voice activity: a per-frame adaptive detector (live) and a post-hoc segment builder
// that turns the per-frame flags into speaking segments and pauses.

/** Per-frame speech/silence decision with an adaptive noise floor and hysteresis. */
export class ActivityDetector {
  private floor = 0.004;
  private active = false;

  constructor(private readonly absoluteMin = 0.008) {}

  reset(): void {
    this.floor = 0.004;
    this.active = false;
  }

  process(rms: number): boolean {
    // Follow the floor down quickly, up slowly, and never while speech is in progress.
    if (rms < this.floor) this.floor = this.floor * 0.8 + rms * 0.2;
    else if (!this.active) this.floor += (rms - this.floor) * 0.01;
    const on = Math.max(this.absoluteMin, this.floor * 3);
    const off = on * 0.7;
    this.active = this.active ? rms > off : rms > on;
    return this.active;
  }
}

export interface Segment {
  startSec: number;
  endSec: number;
}

export interface Pause {
  startSec: number;
  durSec: number;
}

export interface SegmentOptions {
  /** Silences shorter than this are bridged (breath, plosive closures). */
  mergeGapSec: number;
  /** Speech runs shorter than this are discarded as clicks/noise. */
  minSegmentSec: number;
}

export const DEFAULT_SEGMENT_OPTIONS: SegmentOptions = { mergeGapSec: 0.3, minSegmentSec: 0.12 };

/** Duration represented by frame i. Large timestamp jumps (suspended tab) do not count as speech. */
function frameEnd(t: ArrayLike<number>, i: number): number {
  const n = t.length;
  return i + 1 < n ? Math.min(t[i + 1], t[i] + 0.1) : t[i] + 0.025;
}

export function buildSegments(
  t: ArrayLike<number>,
  active: ArrayLike<boolean | number>,
  opts: SegmentOptions = DEFAULT_SEGMENT_OPTIONS,
): { segments: Segment[]; pauses: Pause[] } {
  const runs: Segment[] = [];
  let start = -1;
  let last = -1;
  for (let i = 0; i < t.length; i++) {
    if (active[i]) {
      if (start < 0) start = t[i];
      last = i;
    } else if (start >= 0) {
      runs.push({ startSec: start, endSec: frameEnd(t, last) });
      start = -1;
    }
  }
  if (start >= 0) runs.push({ startSec: start, endSec: frameEnd(t, last) });

  const merged: Segment[] = [];
  for (const r of runs) {
    const prev = merged[merged.length - 1];
    if (prev && r.startSec - prev.endSec < opts.mergeGapSec) prev.endSec = r.endSec;
    else merged.push({ ...r });
  }
  const segments = merged.filter((s) => s.endSec - s.startSec >= opts.minSegmentSec);
  const pauses: Pause[] = [];
  for (let i = 1; i < segments.length; i++) {
    const startSec = segments[i - 1].endSec;
    pauses.push({ startSec, durSec: segments[i].startSec - startSec });
  }
  return { segments, pauses };
}

export interface PauseStats {
  count: number;
  totalSec: number;
  meanSec: number;
  longestSec: number;
  /** Pauses at or above LONG_PAUSE_SEC. */
  longCount: number;
  perMinute: number;
}

export const LONG_PAUSE_SEC = 1.0;

export function pauseStats(pauses: Pause[], durationSec: number): PauseStats {
  const total = pauses.reduce((a, p) => a + p.durSec, 0);
  return {
    count: pauses.length,
    totalSec: total,
    meanSec: pauses.length ? total / pauses.length : 0,
    longestSec: pauses.reduce((a, p) => Math.max(a, p.durSec), 0),
    longCount: pauses.filter((p) => p.durSec >= LONG_PAUSE_SEC).length,
    perMinute: durationSec > 0 ? (pauses.length / durationSec) * 60 : 0,
  };
}
