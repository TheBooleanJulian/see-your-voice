// Piano keyboard geometry shared by the keyboard drawing and its tests.

import { isBlackKey } from '../pitch/notes';

export interface Key {
  midi: number;
  black: boolean;
  /** Left edge and width, in the same units as the keyboard width passed in. */
  x: number;
  w: number;
}

export interface KeyboardGeom {
  low: number;
  high: number;
  whiteCount: number;
  whiteW: number;
  keys: Key[];
  /** X centre for a (possibly fractional) MIDI value, clamped to the keyboard, interpolated between key centres. */
  xForMidi(m: number): number;
}

/** MIDI number of C in the given scientific-pitch octave (C4 = 60). */
export const cMidi = (octave: number): number => (octave + 1) * 12;

export function buildKeyboard(lowOctave: number, octaves: number, width: number): KeyboardGeom {
  const low = cMidi(lowOctave);
  const high = low + octaves * 12; // inclusive: ends on a C
  const whiteCount = Array.from({ length: high - low + 1 }, (_, i) => low + i).filter((m) => !isBlackKey(m)).length;
  const whiteW = width / whiteCount;
  const blackW = whiteW * 0.6;

  const keys: Key[] = [];
  const whiteIndex = new Map<number, number>();
  let wi = 0;
  for (let m = low; m <= high; m++) {
    if (!isBlackKey(m)) {
      whiteIndex.set(m, wi);
      keys.push({ midi: m, black: false, x: wi * whiteW, w: whiteW });
      wi++;
    }
  }
  const centre = new Map<number, number>();
  for (let m = low; m <= high; m++) {
    if (isBlackKey(m)) {
      const prev = whiteIndex.get(m - 1)!; // a black key always follows a white key
      const cx = (prev + 1) * whiteW;
      keys.push({ midi: m, black: true, x: cx - blackW / 2, w: blackW });
      centre.set(m, cx);
    } else {
      centre.set(m, (whiteIndex.get(m)! + 0.5) * whiteW);
    }
  }

  return {
    low,
    high,
    whiteCount,
    whiteW,
    keys,
    xForMidi(m: number): number {
      const c = Math.min(high, Math.max(low, m));
      const i = Math.min(high - 1, Math.floor(c));
      const frac = c - i;
      return centre.get(i)! + (centre.get(i + 1)! - centre.get(i)!) * frac;
    },
  };
}
