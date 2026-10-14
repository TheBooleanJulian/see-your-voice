// Keyboard range that grows (in whole octaves, C to C) to keep out-of-range pitch visible.

import { freqToMidiFloat } from '../pitch/notes';

export interface MidiRange {
  lowMidi: number;
  highMidi: number;
}

/** Hard limits so a tracking glitch can never blow the axis up. */
const MIN_MIDI = 12; // C0
const MAX_MIDI = 108; // C8

/**
 * Widen [lowMidi, highMidi] to cover every voiced F0 in f0[from, to). The base range is
 * never narrowed, and the result stays C-aligned so octave labels keep their places.
 */
export function expandRange(base: MidiRange, a4: number, f0: ArrayLike<number>, from = 0, to = f0.length): MidiRange {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = from; i < to; i++) {
    if (!(f0[i] > 0)) continue;
    const m = freqToMidiFloat(f0[i], a4);
    if (m === null) continue;
    if (m < lo) lo = m;
    if (m > hi) hi = m;
  }
  let { lowMidi, highMidi } = base;
  if (lo !== Infinity && Math.round(lo) < lowMidi) lowMidi = Math.max(MIN_MIDI, Math.floor(Math.round(lo) / 12) * 12);
  if (hi !== -Infinity && Math.round(hi) > highMidi) highMidi = Math.min(MAX_MIDI, Math.ceil(Math.round(hi) / 12) * 12);
  return { lowMidi, highMidi };
}
