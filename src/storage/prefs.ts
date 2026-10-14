// Small preferences in localStorage. Everything is validated and clamped on load so a
// corrupted or hand-edited value can never break the app.

import { DEFAULT_FILLERS } from '../speech/fillers';
import { DEFAULT_TRACKER_CONFIG } from '../pitch/tracker';
import { EXAMPLE_PRESENTATION } from '../practice/passages';

export interface Prefs {
  v: 1;
  deviceId: string;
  /** Octave number of the lowest C on the keyboard (C2 = 2). */
  lowOctave: number;
  octaves: number;
  a4: number;
  graphWindowSec: number;
  graphScale: 'semitone' | 'hz';
  minHz: number;
  maxHz: number;
  yinThreshold: number;
  silenceRms: number;
  fillers: string[];
  lang: string;
  customPassage: string;
  customDurationSec: number;
}

export const DEFAULT_PREFS: Prefs = {
  v: 1,
  deviceId: '',
  lowOctave: 2,
  octaves: 3,
  a4: 440,
  graphWindowSec: 15,
  graphScale: 'semitone',
  minHz: DEFAULT_TRACKER_CONFIG.minHz,
  maxHz: DEFAULT_TRACKER_CONFIG.maxHz,
  yinThreshold: DEFAULT_TRACKER_CONFIG.yinThreshold,
  silenceRms: DEFAULT_TRACKER_CONFIG.silenceRms,
  fillers: DEFAULT_FILLERS,
  lang: 'en-US',
  customPassage: EXAMPLE_PRESENTATION.text,
  customDurationSec: 60,
};

const KEY = 'syv.prefs.v1';

const clamp = (x: unknown, lo: number, hi: number, fallback: number): number =>
  typeof x === 'number' && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : fallback;

export function sanitizePrefs(raw: unknown): Prefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_PREFS;
  const minHz = clamp(r.minHz, 40, 200, d.minHz);
  const maxHz = clamp(r.maxHz, minHz + 50, 1000, Math.max(d.maxHz, minHz + 50));
  const fillers = Array.isArray(r.fillers)
    ? r.fillers.filter((f): f is string => typeof f === 'string' && f.trim() !== '').map((f) => f.trim().toLowerCase()).slice(0, 50)
    : d.fillers;
  return {
    v: 1,
    deviceId: typeof r.deviceId === 'string' ? r.deviceId : d.deviceId,
    lowOctave: Math.round(clamp(r.lowOctave, 1, 4, d.lowOctave)),
    octaves: Math.round(clamp(r.octaves, 2, 5, d.octaves)),
    a4: clamp(r.a4, 400, 480, d.a4),
    graphWindowSec: [10, 15, 20, 30].includes(r.graphWindowSec as number) ? (r.graphWindowSec as number) : d.graphWindowSec,
    graphScale: r.graphScale === 'hz' ? 'hz' : 'semitone',
    minHz,
    maxHz,
    yinThreshold: clamp(r.yinThreshold, 0.05, 0.4, d.yinThreshold),
    silenceRms: clamp(r.silenceRms, 0.002, 0.1, d.silenceRms),
    fillers,
    lang: typeof r.lang === 'string' && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(r.lang) ? r.lang : d.lang,
    customPassage: typeof r.customPassage === 'string' ? r.customPassage.slice(0, 20000) : d.customPassage,
    customDurationSec: Math.round(clamp(r.customDurationSec, 0, 1200, d.customDurationSec)),
  };
}

export function loadPrefs(storage: Pick<Storage, 'getItem'> | null = safeStorage()): Prefs {
  try {
    const s = storage?.getItem(KEY);
    return sanitizePrefs(s ? JSON.parse(s) : null);
  } catch {
    return sanitizePrefs(null);
  }
}

export function savePrefs(p: Prefs, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage full or blocked: preferences just won't persist */
  }
}

export function clearPrefs(storage: Pick<Storage, 'removeItem'> | null = safeStorage()): void {
  try {
    storage?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}
