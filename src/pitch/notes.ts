// Frequency <-> musical note conversion (scientific pitch notation, C4 = MIDI 60).

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export const DEFAULT_A4 = 440;

export interface NoteInfo {
  /** Nearest MIDI note number. */
  midi: number;
  name: string;
  octave: number;
  /** e.g. "A#3" */
  label: string;
  /** Deviation from the nearest note, in cents, in the range [-50, 50]. */
  cents: number;
}

export function isValidFreq(f: unknown): f is number {
  return typeof f === 'number' && Number.isFinite(f) && f > 0;
}

/** Fractional MIDI number for a frequency, or null if the input is not a usable frequency. */
export function freqToMidiFloat(f: number, a4 = DEFAULT_A4): number | null {
  if (!isValidFreq(f) || !isValidFreq(a4)) return null;
  return 69 + 12 * Math.log2(f / a4);
}

export function midiToFreq(midi: number, a4 = DEFAULT_A4): number {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

export function midiToName(midi: number): { name: string; octave: number; label: string } {
  const n = Math.round(midi);
  const name = NOTE_NAMES[((n % 12) + 12) % 12];
  const octave = Math.floor(n / 12) - 1;
  return { name, octave, label: `${name}${octave}` };
}

export function freqToNote(f: number, a4 = DEFAULT_A4): NoteInfo | null {
  const m = freqToMidiFloat(f, a4);
  if (m === null) return null;
  const midi = Math.round(m);
  const { name, octave, label } = midiToName(midi);
  const cents = Math.round((m - midi) * 100);
  return { midi, name, octave, label, cents };
}

/** Signed distance in semitones from frequency `ref` to `f`. */
export function semitonesBetween(ref: number, f: number): number | null {
  if (!isValidFreq(ref) || !isValidFreq(f)) return null;
  return 12 * Math.log2(f / ref);
}

export function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
}

export function formatCents(c: number): string {
  if (c === 0) return '±0¢';
  return `${c > 0 ? '+' : '−'}${Math.abs(c)}¢`;
}
