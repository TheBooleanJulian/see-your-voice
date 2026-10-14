import { createContext, useContext, useEffect, useRef, useState, type RefObject } from 'react';
import { DEFAULT_PREFS, type Prefs } from '../storage/prefs';

// ---- preferences context ----
export interface PrefsApi {
  prefs: Prefs;
  update: (patch: Partial<Prefs>) => void;
  reset: () => void;
}
export const PrefsContext = createContext<PrefsApi>({ prefs: DEFAULT_PREFS, update: () => undefined, reset: () => undefined });
export const usePrefs = (): PrefsApi => useContext(PrefsContext);

// ---- hash routing (no router dependency; works on any static host) ----
export function useHashRoute(): string[] {
  const parse = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [parts, setParts] = useState<string[]>(parse);
  useEffect(() => {
    const onChange = () => {
      setParts(parse());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return parts;
}

// ---- reduced motion ----
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** Re-render at a fixed rate (for readouts that poll mutable engine state). */
export function useTicker(ms: number, enabled = true): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setN((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [ms, enabled]);
  return n;
}

/** Keep a canvas's backing store matched to its CSS size and device pixel ratio. */
export function useCanvasSize(ref: RefObject<HTMLCanvasElement | null>): RefObject<{ w: number; h: number; dpr: number }> {
  const size = useRef({ w: 0, h: 0, dpr: 1 });
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const apply = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      size.current = { w, h, dpr };
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}
