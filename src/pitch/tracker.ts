// Turns raw YIN output into a stable per-frame pitch reading:
// silence gating, voiced/unvoiced decision, octave-jump and outlier suppression,
// and light median smoothing (3 frames, ~75 ms at the default hop).

import { Yin } from './yin';

export interface TrackerConfig {
  minHz: number;
  maxHz: number;
  /** YIN threshold; a frame is voiced when confidence >= 1 - yinThreshold. */
  yinThreshold: number;
  /** Frames quieter than this RMS (0..1, uncalibrated) are treated as silence. */
  silenceRms: number;
}

export interface PitchReading {
  /** Smoothed F0 in Hz; 0 when unvoiced/silent. */
  f0: number;
  confidence: number;
  voiced: boolean;
  /** Voiced, but below the "confident" level. */
  uncertain: boolean;
}

export const DEFAULT_TRACKER_CONFIG: TrackerConfig = {
  minHz: 60,
  maxHz: 500,
  yinThreshold: 0.25,
  silenceRms: 0.01,
};

/** Confidence at or above which a reading is shown as certain. */
export const CONFIDENT_AT = 0.85;

const OCTAVE_CONFIRM = 5; // consecutive octave-offset frames before we believe a real octave jump
const JUMP_CONFIRM = 3; // consecutive far-off frames before we believe a real large jump
const MAX_JUMP_SEMITONES = 8;
const HISTORY = 5;
const FORGET_AFTER_MISSES = 6; // ~150 ms of unvoiced frames: next voiced frame starts fresh

const UNVOICED: PitchReading = { f0: 0, confidence: 0, voiced: false, uncertain: false };

const toSemis = (hz: number) => 12 * Math.log2(hz);
const fromSemis = (s: number) => Math.pow(2, s / 12);

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export class PitchTracker {
  private readonly yin: Yin;
  private history: number[] = []; // accepted pitches in semitones (log2 domain)
  private pending = 0;
  private misses = 0;

  constructor(bufferSize: number) {
    this.yin = new Yin(bufferSize);
  }

  reset(): void {
    this.history = [];
    this.pending = 0;
    this.misses = 0;
  }

  process(buf: ArrayLike<number>, sampleRate: number, rms: number, cfg: TrackerConfig): PitchReading {
    if (!(rms >= cfg.silenceRms)) {
      this.miss();
      return UNVOICED;
    }
    const r = this.yin.detect(buf, {
      sampleRate,
      minHz: cfg.minHz,
      maxHz: cfg.maxHz,
      threshold: cfg.yinThreshold,
    });
    if (r.freq <= 0 || !Number.isFinite(r.freq)) {
      this.miss();
      return { f0: 0, confidence: r.confidence, voiced: false, uncertain: false };
    }

    let s = toSemis(r.freq);
    if (this.history.length >= 3) {
      const dev = s - median(this.history);
      if (Math.abs(Math.abs(dev) - 12) < 1) {
        // Probably a period-doubling/halving error: fold into the established octave,
        // unless the voice has genuinely stayed an octave away for a while.
        if (this.pending < OCTAVE_CONFIRM) {
          this.pending++;
          s -= Math.sign(dev) * 12;
        } else {
          this.history = [];
          this.pending = 0;
        }
      } else if (Math.abs(dev) > MAX_JUMP_SEMITONES) {
        // Isolated far-off frame: drop it unless it persists.
        if (this.pending < JUMP_CONFIRM) {
          this.pending++;
          this.misses++;
          return { f0: 0, confidence: r.confidence, voiced: false, uncertain: false };
        }
        this.history = [];
        this.pending = 0;
      } else {
        this.pending = 0;
      }
    }

    this.misses = 0;
    this.history.push(s);
    if (this.history.length > HISTORY) this.history.shift();
    const smoothed = median(this.history.slice(-3));
    return {
      f0: fromSemis(smoothed),
      confidence: r.confidence,
      voiced: true,
      uncertain: r.confidence < CONFIDENT_AT,
    };
  }

  private miss(): void {
    this.misses++;
    if (this.misses >= FORGET_AFTER_MISSES) {
      this.history = [];
      this.pending = 0;
    }
  }
}
