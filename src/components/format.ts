export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtNum(x: number | null | undefined, digits = 1, unit = ''): string {
  return x === null || x === undefined || !Number.isFinite(x) ? '—' : `${x.toFixed(digits)}${unit}`;
}

export function fmtDelta(x: number | null, digits = 1): string {
  if (x === null || !Number.isFinite(x)) return '—';
  const v = x.toFixed(digits);
  return x > 0 ? `+${v}` : x < 0 ? `−${Math.abs(x).toFixed(digits)}` : v;
}

export function fmtDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
