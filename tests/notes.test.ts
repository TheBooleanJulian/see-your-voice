import { describe, expect, it } from 'vitest';
import { formatCents, freqToMidiFloat, freqToNote, isBlackKey, midiToFreq, midiToName, semitonesBetween } from '../src/pitch/notes';

describe('frequency <-> note', () => {
  it('maps A4 = 440 Hz to MIDI 69 with zero cents', () => {
    expect(freqToMidiFloat(440)).toBeCloseTo(69, 10);
    expect(freqToNote(440)).toEqual({ midi: 69, name: 'A', octave: 4, label: 'A4', cents: 0 });
  });

  it('maps middle C and the C above to distinct octaves', () => {
    const c4 = freqToNote(261.6256)!;
    const c5 = freqToNote(523.2511)!;
    expect(c4.label).toBe('C4');
    expect(c4.midi).toBe(60);
    expect(c5.label).toBe('C5');
    expect(c5.midi).toBe(72);
  });

  it('computes MIDI note and octave across the range', () => {
    expect(midiToName(60)).toMatchObject({ name: 'C', octave: 4 });
    expect(midiToName(59)).toMatchObject({ name: 'B', octave: 3 });
    expect(midiToName(36).label).toBe('C2');
    expect(midiToName(21).label).toBe('A0');
    expect(midiToName(70).label).toBe('A#4');
  });

  it('round-trips note -> frequency -> note', () => {
    for (let m = 24; m <= 96; m++) {
      expect(freqToNote(midiToFreq(m))!.midi).toBe(m);
      expect(freqToNote(midiToFreq(m))!.cents).toBe(0);
    }
  });

  it('computes cents deviation, signed, from the nearest note', () => {
    expect(freqToNote(440 * Math.pow(2, 25 / 1200))!.cents).toBe(25);
    expect(freqToNote(440 * Math.pow(2, -30 / 1200))!.cents).toBe(-30);
    // Beyond 50 cents the nearest note changes and the sign flips.
    const n = freqToNote(440 * Math.pow(2, 70 / 1200))!;
    expect(n.label).toBe('A#4');
    expect(n.cents).toBe(-30);
  });

  it('honours a configurable reference tuning', () => {
    expect(freqToNote(432, 432)!.label).toBe('A4');
    expect(freqToNote(432, 432)!.cents).toBe(0);
    expect(freqToNote(432, 440)!.label).toBe('A4');
    expect(freqToNote(432, 440)!.cents).toBe(-32);
    expect(midiToFreq(69, 432)).toBe(432);
  });

  it('rejects missing or invalid frequencies', () => {
    for (const bad of [0, -5, NaN, Infinity, -Infinity, undefined as unknown as number, null as unknown as number]) {
      expect(freqToNote(bad)).toBeNull();
      expect(freqToMidiFloat(bad)).toBeNull();
    }
    expect(freqToNote(440, 0)).toBeNull();
    expect(semitonesBetween(0, 100)).toBeNull();
    expect(semitonesBetween(100, 200)).toBeCloseTo(12, 10);
  });

  it('identifies black keys and formats cents', () => {
    expect([60, 61, 62, 63, 64, 65, 66].map(isBlackKey)).toEqual([false, true, false, true, false, false, true]);
    expect(isBlackKey(-1)).toBe(false); // B
    expect(formatCents(12)).toBe('+12¢');
    expect(formatCents(-7)).toBe('−7¢');
    expect(formatCents(0)).toBe('±0¢');
  });
});
