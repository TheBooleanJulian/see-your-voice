import { describe, expect, it } from 'vitest';
import { percentile, semitoneSpan, summarizePitch } from '../src/pitch/stats';

describe('pitch range statistics', () => {
  it('returns null when there is no valid pitch', () => {
    expect(summarizePitch([])).toBeNull();
    expect(summarizePitch([0, 0, NaN, -3, Infinity])).toBeNull();
  });

  it('ignores missing/invalid values among valid ones', () => {
    const s = summarizePitch([0, 100, NaN, 100, -1, 100])!;
    expect(s.voicedFrames).toBe(3);
    expect(s.minHz).toBe(100);
    expect(s.maxHz).toBe(100);
  });

  it('computes the semitone range of an octave', () => {
    const s = summarizePitch([100, 200])!;
    expect(s.fullRangeSemitones).toBeCloseTo(12, 10);
    expect(semitoneSpan(100, 200)).toBeCloseTo(12, 10);
    expect(semitoneSpan(0, 200)).toBe(0);
  });

  it('has zero variation for a constant pitch and all time near the median', () => {
    const s = summarizePitch(new Array(50).fill(140))!;
    expect(s.stdSemitones).toBe(0);
    expect(s.rangeSemitones).toBe(0);
    expect(s.nearMedianFraction).toBe(1);
    expect(s.medianHz).toBe(140);
  });

  it('uses a robust 5th-95th percentile range that ignores a single glitch', () => {
    const f0 = new Array(200).fill(0).map((_, i) => 120 + (i % 20)); // 120..139 Hz
    f0.push(480); // one tracking glitch
    const s = summarizePitch(f0)!;
    expect(s.fullRangeSemitones).toBeCloseTo(24, 5); // 120 Hz -> 480 Hz is exactly two octaves
    expect(s.rangeSemitones).toBeLessThan(3);
  });

  it('bands partition the voiced time', () => {
    const f0 = [100, 110, 120, 130, 140, 150, 160, 200, 60, 100];
    const s = summarizePitch(f0)!;
    expect(s.bands.reduce((a, b) => a + b.fraction, 0)).toBeCloseTo(1, 10);
    expect(s.bands).toHaveLength(7);
  });

  it('interpolates percentiles', () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([5], 0.9)).toBe(5);
    expect(percentile([], 0.5)).toBeNaN();
  });
});
