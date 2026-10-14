import { describe, expect, it } from 'vitest';
import { DEFAULT_TRACKER_CONFIG, PitchTracker } from '../src/pitch/tracker';
import { Yin } from '../src/pitch/yin';
import { cents, harmonic, noise, rms, sine } from './helpers';

const N = 2048;
const params = (sampleRate: number) => ({ sampleRate, minHz: 60, maxHz: 500, threshold: 0.25 });

describe('YIN', () => {
  const yin = new Yin(N);

  it.each([48000, 44100, 16000])('detects sine waves across the speech range at %i Hz', (sr) => {
    for (const f of [85, 120, 165, 220, 330, 440]) {
      const r = yin.detect(sine(f, sr, N), params(sr));
      expect(Math.abs(cents(r.freq, f))).toBeLessThan(15);
      expect(r.confidence).toBeGreaterThan(0.9);
    }
  });

  it('finds the fundamental of a harmonic signal whose fundamental is weak', () => {
    for (const f of [110, 150, 200]) {
      const r = yin.detect(harmonic(f, 48000, N), params(48000));
      expect(Math.abs(cents(r.freq, f))).toBeLessThan(25);
    }
  });

  it('returns no pitch for silence and for white noise', () => {
    expect(yin.detect(new Float32Array(N), params(48000)).freq).toBe(0);
    const r = yin.detect(noise(N), params(48000));
    expect(r.freq).toBe(0);
    expect(r.confidence).toBeLessThan(0.75);
  });

  it('does not report a pitch outside the configured range', () => {
    const r = yin.detect(sine(800, 48000, N), params(48000));
    expect(r.freq === 0 || r.freq <= 500).toBe(true);
  });

  it('survives degenerate parameters', () => {
    expect(yin.detect(sine(200, 48000, N), { ...params(48000), minHz: 0 }).freq).toBe(0);
    expect(yin.detect(sine(200, 48000, N), { ...params(48000), maxHz: 50 }).freq).toBe(0);
    expect(yin.detect(sine(200, 0, N), params(0)).freq).toBe(0);
  });
});

describe('PitchTracker', () => {
  const sr = 48000;
  const cfg = DEFAULT_TRACKER_CONFIG;
  const feed = (t: PitchTracker, buf: Float32Array, times = 1) => {
    let last = t.process(buf, sr, rms(buf), cfg);
    for (let i = 1; i < times; i++) last = t.process(buf, sr, rms(buf), cfg);
    return last;
  };

  it('reports a steady voiced tone', () => {
    const t = new PitchTracker(N);
    const r = feed(t, sine(180, sr, N), 10);
    expect(r.voiced).toBe(true);
    expect(r.uncertain).toBe(false);
    expect(Math.abs(cents(r.f0, 180))).toBeLessThan(15);
  });

  it('treats quiet input as silence (RMS gate)', () => {
    const t = new PitchTracker(N);
    const quiet = sine(180, sr, N, 0.004); // rms ~0.003 < 0.01
    expect(feed(t, quiet, 5)).toMatchObject({ voiced: false, f0: 0 });
  });

  it('treats noise as unvoiced', () => {
    const t = new PitchTracker(N);
    expect(feed(t, noise(N), 5).voiced).toBe(false);
  });

  it('folds a brief octave error back into the established octave', () => {
    const t = new PitchTracker(N);
    feed(t, sine(200, sr, N), 10);
    const glitch = feed(t, sine(100, sr, N), 2);
    expect(glitch.voiced).toBe(true);
    expect(Math.abs(cents(glitch.f0, 200))).toBeLessThan(40);
  });

  it('accepts a sustained octave change after confirmation', () => {
    const t = new PitchTracker(N);
    feed(t, sine(200, sr, N), 10);
    const r = feed(t, sine(100, sr, N), 20);
    expect(Math.abs(cents(r.f0, 100))).toBeLessThan(40);
  });

  it('drops an isolated far-off frame but accepts a persistent move', () => {
    const t = new PitchTracker(N);
    feed(t, sine(150, sr, N), 10);
    const lone = feed(t, sine(260, sr, N), 1); // ~9.5 semitones away, not an octave
    expect(lone.voiced).toBe(false);
    const settled = feed(t, sine(260, sr, N), 12);
    expect(settled.voiced).toBe(true);
    expect(Math.abs(cents(settled.f0, 260))).toBeLessThan(40);
  });

  it('forgets history after a silence so a new utterance starts fresh', () => {
    const t = new PitchTracker(N);
    feed(t, sine(120, sr, N), 10);
    feed(t, new Float32Array(N), 10);
    const r = feed(t, sine(300, sr, N), 3);
    expect(r.voiced).toBe(true);
    expect(Math.abs(cents(r.f0, 300))).toBeLessThan(40);
  });
});
