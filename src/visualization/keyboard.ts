// Piano helpers for the vertical keyboard axis.

/** MIDI number of C in the given scientific-pitch octave (C4 = 60). */
export const cMidi = (octave: number): number => (octave + 1) * 12;
