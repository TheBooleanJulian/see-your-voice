// Canvas renderers for the live studio and the review charts. These are plain functions of
// (context, size, state) so the React components stay thin and nothing allocates per frame
// beyond a few short-lived objects.

import type { Contour } from '../audio/frameLog';
import { FLAG_ACTIVE, FLAG_UNCERTAIN, type FrameLog } from '../audio/frameLog';
import { formatCents, freqToMidiFloat, freqToNote, isBlackKey, midiToFreq, midiToName } from '../pitch/notes';
import { expandRange } from './range';
import type { Theme } from './theme';

function hatch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let k = -h; k < w; k += 5) {
    ctx.moveTo(x + k, y + h);
    ctx.lineTo(x + k + h, y);
  }
  ctx.stroke();
  ctx.restore();
}

export interface GraphState {
  theme: Theme;
  log: FrameLog;
  /** Right edge of the visible window, in session seconds. */
  tEnd: number;
  windowSec: number;
  scale: 'semitone' | 'hz';
  lowMidi: number;
  highMidi: number;
  a4: number;
  hoverX: number | null;
  frozen: boolean;
  reducedMotion: boolean;
}

/** Left gutter holding the vertical piano keys. */
export const PLOT_LEFT = 54;
const GL = PLOT_LEFT;
const GR = 10;
const GT = 8;
const STRIP_H = 14;
const AXIS_H = 18;

export interface PlotBox {
  left: number;
  top: number;
  plotW: number;
  plotH: number;
  stripTop: number;
}

export function plotBox(w: number, h: number): PlotBox {
  const plotH = h - GT - STRIP_H - AXIS_H - 8;
  return { left: GL, top: GT, plotW: w - GL - GR, plotH, stripTop: GT + plotH + 6 };
}

type Range = Pick<GraphState, 'scale' | 'lowMidi' | 'highMidi' | 'a4'>;

// The y range extends half a semitone past each end so the edge keys are whole.
function yMapper(s: Range, box: PlotBox) {
  if (s.scale === 'semitone') {
    const lo = s.lowMidi - 0.5;
    const span = s.highMidi - s.lowMidi + 1;
    return (hz: number) => {
      const m = freqToMidiFloat(hz, s.a4) ?? lo;
      return box.top + (1 - (m - lo) / span) * box.plotH;
    };
  }
  const fLo = midiToFreq(s.lowMidi - 0.5, s.a4);
  const fHi = midiToFreq(s.highMidi + 0.5, s.a4);
  return (hz: number) => box.top + (1 - (hz - fLo) / (fHi - fLo)) * box.plotH;
}

/** Piano-roll axis: one row per semitone, drawn as keys in the left gutter and faint rows in the plot. */
function drawPianoAxis(
  ctx: CanvasRenderingContext2D,
  s: Range & { theme: Theme },
  box: PlotBox,
  w: number,
  active: { midi: number; uncertain: boolean } | null,
): void {
  const y = yMapper(s, box);
  const rowTop = (m: number) => Math.max(box.top, y(midiToFreq(m + 0.5, s.a4)));
  const rowBot = (m: number) => Math.min(box.top + box.plotH, y(midiToFreq(m - 0.5, s.a4)));
  const keyW = box.left - 4;
  const labelAll = rowBot(s.lowMidi) - rowTop(s.lowMidi) >= 11;

  ctx.textBaseline = 'middle';
  for (let m = s.lowMidi; m <= s.highMidi; m++) {
    const top = rowTop(m);
    const h = rowBot(m) - top;
    if (h <= 0) continue;
    const black = isBlackKey(m);
    if (black) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(box.left, top, box.plotW, h);
    }
    ctx.fillStyle = s.theme.keyWhite;
    ctx.fillRect(0, top, keyW, Math.max(1, h - (black ? 0 : 0.5)));
    if (black) {
      ctx.fillStyle = s.theme.keyBlack;
      ctx.fillRect(0, top, keyW * 0.62, Math.max(1, h - 0.5));
    }
    const on = active !== null && active.midi === m;
    if (on) {
      const hh = Math.max(2, h);
      ctx.fillStyle = active.uncertain ? 'rgba(0,212,200,0.3)' : s.theme.live;
      ctx.fillRect(0, top, keyW, hh);
      if (active.uncertain) {
        hatch(ctx, 0, top, keyW, hh, s.theme.live);
        ctx.strokeStyle = s.theme.live;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 2]);
        ctx.strokeRect(0.75, top + 0.75, keyW - 1.5, hh - 1.5);
        ctx.setLineDash([]);
      }
    }
    const { name, label } = midiToName(m);
    if (!black && (name === 'C' || labelAll)) {
      ctx.font = `${name === 'C' ? 600 : 400} 9px ${s.theme.mono}`;
      ctx.fillStyle = on && !active.uncertain ? s.theme.void : '#3A4352';
      ctx.textAlign = 'right';
      ctx.fillText(name === 'C' ? label : name, keyW - 3, top + h / 2);
    }
    if (name === 'C') {
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(box.left, top + h);
      ctx.lineTo(w - GR, top + h);
      ctx.stroke();
    }
  }
}

function drawHzAxis(ctx: CanvasRenderingContext2D, s: Range & { theme: Theme }, box: PlotBox, w: number): void {
  const y = yMapper(s, box);
  const fLo = midiToFreq(s.lowMidi - 0.5, s.a4);
  const fHi = midiToFreq(s.highMidi + 0.5, s.a4);
  const step = fHi - fLo > 600 ? 100 : 50;
  ctx.font = `10px ${s.theme.mono}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 1;
  for (let f = Math.ceil(fLo / step) * step; f <= fHi; f += step) {
    const yy = y(f);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.moveTo(box.left, yy);
    ctx.lineTo(w - GR, yy);
    ctx.stroke();
    ctx.fillStyle = s.theme.dim;
    ctx.fillText(`${f} Hz`, box.left + 4, yy - 7);
  }
}

export function drawPitchGraph(ctx: CanvasRenderingContext2D, w: number, h: number, input: GraphState): void {
  const { theme, log } = input;
  // Grow the keyboard (whole octaves) if the voice leaves the configured range inside the visible window.
  let first = log.length;
  while (first > 0 && log.t[first - 1] >= input.tEnd - input.windowSec - 0.05) first--;
  const s: GraphState = { ...input, ...expandRange(input, input.a4, log.f0, first, log.length) };
  const box = plotBox(w, h);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = theme.surface;
  ctx.fillRect(box.left, box.top, box.plotW, box.plotH);
  const last = log.length - 1;
  const fresh = last >= 0 && log.f0[last] > 0 && s.tEnd - log.t[last] < 0.25;
  const liveMidi = fresh ? freqToMidiFloat(log.f0[last], s.a4) : null;
  if (s.scale === 'hz') drawHzAxis(ctx, s, box, w);
  drawPianoAxis(ctx, s, box, w, liveMidi === null ? null : { midi: Math.round(liveMidi), uncertain: (log.flags[last] & FLAG_UNCERTAIN) !== 0 });
  if (liveMidi !== null && (liveMidi > s.highMidi + 0.5 || liveMidi < s.lowMidi - 0.5)) {
    const above = liveMidi > s.highMidi + 0.5;
    ctx.font = `11px ${theme.mono}`;
    ctx.fillStyle = theme.gold;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(above ? `▲ above ${midiToName(s.highMidi).label}` : `▼ below ${midiToName(s.lowMidi).label}`, w - GR - 4, above ? box.top + 10 : box.top + box.plotH - 10);
  }

  const t0 = s.tEnd - s.windowSec;
  const xOf = (t: number) => box.left + ((t - t0) / s.windowSec) * box.plotW;
  const y = yMapper(s, box);
  const clampY = (v: number) => Math.min(box.top + box.plotH - 1, Math.max(box.top + 1, v));

  // X axis: time labels counted back from "now".
  ctx.font = `10px ${theme.mono}`;
  ctx.fillStyle = theme.dim;
  ctx.textBaseline = 'alphabetic';
  const step = s.windowSec <= 15 ? 5 : 10;
  ctx.textAlign = 'center';
  for (let back = s.windowSec; back > 0; back -= step) {
    const x = xOf(s.tEnd - back);
    if (x < box.left + 14) continue;
    ctx.fillText(`−${back}s`, x, h - 4);
  }
  ctx.textAlign = 'right';
  ctx.fillText(s.frozen ? 'frozen' : 'now', w - GR, h - 4);

  // Frames in view.
  let i0 = log.length;
  while (i0 > 0 && log.t[i0 - 1] >= t0 - 0.05) i0--;

  // Activity strip: full bar = voiced, half bar = speech without steady pitch, baseline = silence.
  for (let i = i0; i < log.length; i++) {
    const x = xOf(log.t[i]);
    const wd = Math.max(1, (0.025 / s.windowSec) * box.plotW + 0.5);
    const voiced = log.f0[i] > 0;
    const act = (log.flags[i] & FLAG_ACTIVE) !== 0;
    if (voiced) {
      ctx.fillStyle = theme.live;
      ctx.fillRect(x, box.stripTop, wd, STRIP_H);
    } else if (act) {
      ctx.fillStyle = theme.gold;
      ctx.fillRect(x, box.stripTop + STRIP_H / 2, wd, STRIP_H / 2);
    } else {
      ctx.fillStyle = theme.grid;
      ctx.fillRect(x, box.stripTop + STRIP_H - 2, wd, 2);
    }
  }

  // Pitch contour: solid when confident, dashed + dimmer when uncertain; breaks at unvoiced gaps.
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.left, box.top, box.plotW, box.plotH);
  ctx.clip();
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = theme.pitch;
  ctx.fillStyle = theme.pitch;
  let run: { x: number; y: number }[] = [];
  let runUncertain = false;
  const flush = () => {
    if (run.length === 0) return;
    ctx.setLineDash(runUncertain ? [3, 5] : []);
    ctx.globalAlpha = runUncertain ? 0.6 : 1;
    if (run.length === 1) {
      ctx.beginPath();
      ctx.arc(run[0].x, run[0].y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(run[0].x, run[0].y);
      for (let k = 1; k < run.length; k++) ctx.lineTo(run[k].x, run[k].y);
      ctx.stroke();
    }
    run = [];
  };
  for (let i = i0; i < log.length; i++) {
    const f = log.f0[i];
    const gap = i > i0 && log.t[i] - log.t[i - 1] > 0.12;
    if (f <= 0 || gap) flush();
    if (f <= 0) continue;
    const unc = (log.flags[i] & FLAG_UNCERTAIN) !== 0;
    const pt = { x: xOf(log.t[i]), y: clampY(y(f)) };
    if (run.length && unc !== runUncertain) {
      const last = run[run.length - 1];
      flush();
      run = [last];
    }
    runUncertain = unc;
    run.push(pt);
  }
  flush();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.restore();

  // Current-pitch marker.
  const n = log.length;
  if (n > 0 && log.f0[n - 1] > 0 && s.tEnd - log.t[n - 1] < 0.25) {
    const x = xOf(log.t[n - 1]);
    const yy = clampY(y(log.f0[n - 1]));
    ctx.fillStyle = theme.void;
    ctx.strokeStyle = theme.pitch;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(Math.min(x, w - GR - 5), yy, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const note = freqToNote(log.f0[n - 1], s.a4);
    if (note) {
      ctx.font = `600 11px ${theme.mono}`;
      ctx.fillStyle = theme.text;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(note.label, Math.min(x, w - GR - 5) - 11, yy - (yy < box.top + 14 ? -12 : 12));
    }
  }

  if (n === 0) {
    ctx.font = `12px ${theme.font}`;
    ctx.fillStyle = theme.dim;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Pitch contour appears here once you start speaking', box.left + box.plotW / 2, box.top + box.plotH / 2);
  }

  // Hover / scrub readout.
  if (s.hoverX !== null && s.hoverX >= box.left && s.hoverX <= box.left + box.plotW && n > 0) {
    const tHover = t0 + ((s.hoverX - box.left) / box.plotW) * s.windowSec;
    let idx = log.lowerBound(tHover);
    if (idx >= n) idx = n - 1;
    if (idx > 0 && Math.abs(log.t[idx - 1] - tHover) < Math.abs(log.t[idx] - tHover)) idx--;
    ctx.strokeStyle = theme.dim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(s.hoverX, box.top);
    ctx.lineTo(s.hoverX, box.stripTop + STRIP_H);
    ctx.stroke();
    const f = log.f0[idx];
    const note = f > 0 ? freqToNote(f, s.a4) : null;
    const text = note
      ? `${(log.t[idx] - s.tEnd).toFixed(1)}s · ${f.toFixed(0)} Hz · ${note.label} ${formatCents(note.cents)}${(log.flags[idx] & FLAG_UNCERTAIN) !== 0 ? ' · uncertain' : ''}`
      : `${(log.t[idx] - s.tEnd).toFixed(1)}s · ${(log.flags[idx] & FLAG_ACTIVE) !== 0 ? 'speech, no steady pitch' : 'silence'}`;
    ctx.font = `11px ${theme.mono}`;
    const tw = ctx.measureText(text).width + 12;
    const bx = Math.min(Math.max(box.left, s.hoverX + 8), w - GR - tw);
    ctx.fillStyle = 'rgba(5,5,8,0.92)';
    ctx.fillRect(bx, box.top + 4, tw, 20);
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + 6, box.top + 14);
  }
}

// ---------------------------------------------------------------------------------------
// Static contour chart (review + comparison)
// ---------------------------------------------------------------------------------------

export interface ContourSeries {
  label: string;
  color: string;
  contour: Contour;
  /** Align by median pitch (semitones relative to the series' own median) instead of absolute. */
  medianHz?: number;
}

export interface ContourChartState {
  theme: Theme;
  series: ContourSeries[];
  durationSec: number;
  /** 'absolute': keyboard note range. 'relative': semitones around each series' own median. */
  mode: 'absolute' | 'relative';
  scale: 'semitone' | 'hz';
  lowMidi: number;
  highMidi: number;
  a4: number;
  playhead: number | null;
  /** Pause intervals to shade (first series only). */
  pauses?: { startSec: number; durSec: number }[];
}

export function drawContourChart(ctx: CanvasRenderingContext2D, w: number, h: number, input: ContourChartState): void {
  const { theme } = input;
  let s = input;
  if (input.mode === 'absolute') {
    let range = { lowMidi: input.lowMidi, highMidi: input.highMidi };
    for (const ser of input.series) range = expandRange(range, input.a4, ser.contour.f0);
    s = { ...input, ...range };
  }
  const box = plotBox(w, h);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = theme.surface;
  ctx.fillRect(box.left, box.top, box.plotW, box.plotH);
  const dur = Math.max(1, s.durationSec);
  const xOf = (t: number) => box.left + (t / dur) * box.plotW;

  // Pause shading (labelled in the legend; also visible as breaks in the line).
  if (s.pauses) {
    ctx.fillStyle = 'rgba(245,200,66,0.10)';
    for (const p of s.pauses) ctx.fillRect(xOf(p.startSec), box.top, Math.max(1, (p.durSec / dur) * box.plotW), box.plotH);
  }

  let yOf: (hz: number, medianHz?: number) => number;
  if (s.mode === 'relative') {
    const span = 12; // ±6 semitones
    ctx.font = `10px ${theme.mono}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let st = -6; st <= 6; st += 3) {
      const yy = box.top + (1 - (st + span / 2) / span) * box.plotH;
      ctx.strokeStyle = st === 0 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)';
      ctx.beginPath();
      ctx.moveTo(box.left, yy);
      ctx.lineTo(w - GR, yy);
      ctx.stroke();
      ctx.fillStyle = theme.dim;
      ctx.fillText(st === 0 ? 'median' : `${st > 0 ? '+' : '−'}${Math.abs(st)} st`, box.left - 6, yy);
    }
    yOf = (hz, med) => {
      const st = 12 * Math.log2(hz / (med || hz));
      return box.top + (1 - (st + span / 2) / span) * box.plotH;
    };
  } else {
    if (s.scale === 'hz') drawHzAxis(ctx, s, box, w);
    drawPianoAxis(ctx, s, box, w, null);
    yOf = yMapper(s, box);
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(box.left, box.top, box.plotW, box.plotH);
  ctx.clip();
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  s.series.forEach((ser, si) => {
    ctx.strokeStyle = ser.color;
    ctx.setLineDash(si === 0 ? [] : si === 1 ? [7, 4] : [2, 4]); // series also differ by dash, not colour alone
    const c = ser.contour;
    let drawing = false;
    ctx.beginPath();
    for (let i = 0; i < c.t.length; i++) {
      const f = c.f0[i];
      const gap = i > 0 && c.t[i] - c.t[i - 1] > 0.12;
      if (f <= 0 || gap) drawing = false;
      if (f <= 0) continue;
      const x = xOf(c.t[i]);
      const yy = Math.min(box.top + box.plotH, Math.max(box.top, yOf(f, ser.medianHz)));
      if (!drawing) {
        ctx.moveTo(x, yy);
        drawing = true;
      } else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  });
  ctx.restore();
  ctx.setLineDash([]);

  // Time axis.
  ctx.font = `10px ${theme.mono}`;
  ctx.fillStyle = theme.dim;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const step = dur > 120 ? 30 : dur > 40 ? 10 : 5;
  for (let t = 0; t <= dur; t += step) ctx.fillText(`${t}s`, xOf(t), h - 4);

  if (s.playhead !== null && s.playhead >= 0 && s.playhead <= dur) {
    ctx.strokeStyle = theme.text;
    ctx.lineWidth = 1.5;
    const x = xOf(s.playhead);
    ctx.beginPath();
    ctx.moveTo(x, box.top);
    ctx.lineTo(x, box.top + box.plotH);
    ctx.stroke();
  }
}
