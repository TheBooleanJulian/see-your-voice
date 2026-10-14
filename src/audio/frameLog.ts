// Fixed-capacity, preallocated log of analysis frames. Serves both the live graph and the
// recorded session contour, so memory is bounded (capacity frames) for any session length.

export const FLAG_ACTIVE = 1; // voice activity (speech vs silence)
export const FLAG_UNCERTAIN = 2; // voiced, but below the confident level

export const ANALYSIS_INTERVAL_MS = 25;
export const FRAMES_PER_SECOND = 1000 / ANALYSIS_INTERVAL_MS;
export const MAX_SESSION_SEC = 20 * 60;
export const FRAME_CAPACITY = Math.ceil(MAX_SESSION_SEC * FRAMES_PER_SECOND) + 64;

/** A recorded pitch/loudness contour. Plain arrays are accepted so tests can build one easily. */
export interface Contour {
  /** Seconds since session start. */
  t: ArrayLike<number>;
  /** F0 in Hz; 0 where unvoiced. */
  f0: ArrayLike<number>;
  conf: ArrayLike<number>;
  /** Linear RMS 0..1 (uncalibrated). */
  rms: ArrayLike<number>;
  flags: ArrayLike<number>;
}

export class FrameLog {
  length = 0;
  readonly t: Float32Array;
  readonly f0: Float32Array;
  readonly conf: Float32Array;
  readonly rms: Float32Array;
  readonly flags: Uint8Array;

  constructor(readonly capacity: number = FRAME_CAPACITY) {
    this.t = new Float32Array(capacity);
    this.f0 = new Float32Array(capacity);
    this.conf = new Float32Array(capacity);
    this.rms = new Float32Array(capacity);
    this.flags = new Uint8Array(capacity);
  }

  /** Returns false when the log is full. */
  push(t: number, f0: number, conf: number, rms: number, flags: number): boolean {
    if (this.length >= this.capacity) return false;
    const i = this.length++;
    this.t[i] = t;
    this.f0[i] = f0;
    this.conf[i] = conf;
    this.rms[i] = rms;
    this.flags[i] = flags;
    return true;
  }

  clear(): void {
    this.length = 0;
  }

  /** Copy out the recorded frames (the log itself keeps being reused). */
  toContour(): { t: Float32Array; f0: Float32Array; conf: Float32Array; rms: Float32Array; flags: Uint8Array } {
    const n = this.length;
    return {
      t: this.t.slice(0, n),
      f0: this.f0.slice(0, n),
      conf: this.conf.slice(0, n),
      rms: this.rms.slice(0, n),
      flags: this.flags.slice(0, n),
    };
  }

  /** Index of the first frame with t >= time (binary search). */
  lowerBound(time: number): number {
    let lo = 0;
    let hi = this.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.t[mid] < time) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}
