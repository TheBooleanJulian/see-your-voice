// Canvas colours come from the CSS custom properties so there is one source of truth.

export interface Theme {
  void: string;
  surface: string;
  grid: string;
  text: string;
  dim: string;
  live: string;
  pitch: string;
  gold: string;
  good: string;
  keyWhite: string;
  keyBlack: string;
  font: string;
  mono: string;
}

const FALLBACK: Theme = {
  void: '#050508',
  surface: '#0A0E14',
  grid: 'rgba(255,255,255,0.08)',
  text: '#E6EAF0',
  dim: '#8A94A6',
  live: '#00D4C8',
  pitch: '#A78BFA',
  gold: '#F5C842',
  good: '#4ADE80',
  keyWhite: '#CBD3DE',
  keyBlack: '#0B0F17',
  font: 'system-ui, sans-serif',
  mono: 'ui-monospace, monospace',
};

export function readTheme(): Theme {
  if (typeof document === 'undefined') return FALLBACK;
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
  return {
    void: v('--void', FALLBACK.void),
    surface: v('--surface', FALLBACK.surface),
    grid: v('--grid', FALLBACK.grid),
    text: v('--text', FALLBACK.text),
    dim: v('--dim', FALLBACK.dim),
    live: v('--live', FALLBACK.live),
    pitch: v('--pitch', FALLBACK.pitch),
    gold: v('--gold', FALLBACK.gold),
    good: v('--good', FALLBACK.good),
    keyWhite: v('--key-white', FALLBACK.keyWhite),
    keyBlack: v('--key-black', FALLBACK.keyBlack),
    font: v('--font-ui', FALLBACK.font),
    mono: v('--font-mono', FALLBACK.mono),
  };
}
