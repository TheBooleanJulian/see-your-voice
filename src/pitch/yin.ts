// YIN fundamental-frequency estimator (de Cheveigné & Kawahara, 2002).
//
// The input is decimated to ~12 kHz first: speech F0 is below ~500 Hz, so this cuts
// the O(window x lag) difference function by roughly 16x for 48 kHz input and keeps
// the analysis cheap enough to run on the main thread without allocation per frame.

export interface YinParams {
  sampleRate: number;
  minHz: number;
  maxHz: number;
  /** Absolute threshold on the cumulative-mean-normalised difference. Lower = stricter. */
  threshold: number;
}

export interface YinResult {
  /** Estimated F0 in Hz, or 0 when no period was found. */
  freq: number;
  /** 1 - normalised difference at the chosen lag, clamped to [0, 1]. */
  confidence: number;
}

const TARGET_RATE = 12000;
const NONE: YinResult = { freq: 0, confidence: 0 };

export class Yin {
  private readonly dec: Float32Array;
  private readonly cmnd: Float32Array;

  constructor(inputSize: number) {
    this.dec = new Float32Array(inputSize);
    this.cmnd = new Float32Array(inputSize);
  }

  detect(input: ArrayLike<number>, p: YinParams): YinResult {
    if (!(p.sampleRate > 0) || !(p.minHz > 0) || !(p.maxHz > p.minHz)) return NONE;
    const factor = Math.max(1, Math.floor(p.sampleRate / TARGET_RATE));
    const n = Math.min(Math.floor(input.length / factor), this.dec.length);
    const sr = p.sampleRate / factor;
    const dec = this.dec;

    // Decimate by block-averaging (acts as a crude low-pass) and remove DC.
    let mean = 0;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = 0; k < factor; k++) s += input[i * factor + k];
      dec[i] = s / factor;
      mean += dec[i];
    }
    mean /= n || 1;
    for (let i = 0; i < n; i++) dec[i] -= mean;

    const tauMin = Math.max(2, Math.floor(sr / p.maxHz));
    const tauMax = Math.min(Math.ceil(sr / p.minHz), Math.floor(n / 2));
    if (tauMax <= tauMin + 2) return NONE;
    const w = n - tauMax;

    // Difference function with cumulative mean normalisation.
    const d = this.cmnd;
    d[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
      let sum = 0;
      for (let j = 0; j < w; j++) {
        const diff = dec[j] - dec[j + tau];
        sum += diff * diff;
      }
      running += sum;
      d[tau] = running > 0 ? (sum * tau) / running : 1;
    }

    // First lag under the threshold, descended to its local minimum.
    let tau = tauMin;
    let found = -1;
    while (tau < tauMax) {
      if (d[tau] < p.threshold) {
        while (tau + 1 < tauMax && d[tau + 1] < d[tau]) tau++;
        found = tau;
        break;
      }
      tau++;
    }

    if (found < 0) {
      // No periodicity: report how close we came so the UI can show a confidence value.
      let best = tauMin;
      for (let t = tauMin; t < tauMax; t++) if (d[t] < d[best]) best = t;
      return { freq: 0, confidence: clamp01(1 - d[best]) };
    }

    // Parabolic interpolation around the minimum for sub-sample lag accuracy.
    let better = found;
    if (found > 1 && found < tauMax) {
      const a = d[found - 1];
      const b = d[found];
      const c = d[found + 1];
      const denom = a - 2 * b + c;
      if (denom !== 0) better = found + (a - c) / (2 * denom);
    }
    return { freq: sr / better, confidence: clamp01(1 - d[found]) };
  }
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
