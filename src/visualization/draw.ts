// Canvas renderers for the live studio and the review charts. These are plain functions of
// (context, size, state) so the React components stay thin and nothing allocates per frame
// beyond a few short-lived objects.

import type { Contour } from '../audio/frameLog';
import { FLAG_ACTIVE, FLAG_UNCERTAIN, type FrameLog } from '../audio/frameLog';
import { formatCents, freqToMidiFloat, freqToNote, midiToFreq, midiToName } from '../pitch/notes';
import type { KeyboardGeom } from './keyboard';
import type { Theme } from './theme';

export const RIBBON_H = 34;

export interface KeyboardState {
  geom: KeyboardGeom;
  theme: Theme;
  /** Current pitch (fractional MIDI) or null when unvoiced/silent. */
  midi: number | null;
  uncertain: boolean;
  /** Recent voiced points for the movement trail. */
  trail: { midi: number; age: number; uncertain: boolean }[];
  reducedMotion: boolean;
  /** True once a session exists (distinguishes "ready" from "unvoiced"). */
  hasSession: boolean;
}

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

export function drawKeyboard(ctx: CanvasRenderingContext2D, w: number, h: number, s: KeyboardState): void {
  const { geom, theme } = s;
  ctx.clearRect(0, 0, w, h);
  const keyTop = RIBBON_H;
  const keyH = h - keyTop;
  const blackH = keyH * 0.6;
  const active = s.midi === null ? null : Math.round(s.midi);

  // --- ribbon: pitch position + trail above the keys ---
  ctx.fillStyle = theme.surface;
  ctx.fillRect(0, 0, w, RIBBON_H - 4);
  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1;
  ctx.fillStyle = theme.dim;
  ctx.font = `10px ${theme.mono}`;
  ctx.textBaseline = 'top';
  for (let m = geom.low; m <= geom.high; m += 12) {
    const x = geom.xForMidi(m);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, RIBBON_H - 4);
    ctx.stroke();
    ctx.textAlign = m === geom.low ? 'left' : m === geom.high ? 'right' : 'center';
    ctx.fillText(midiToName(m).label, x + (m === geom.low ? 3 : m === geom.high ? -3 : 0), 2);
  }
  if (!s.reducedMotion) {
    for (const p of s.trail) {
      ctx.globalAlpha = Math.max(0, 1 - p.age / 1.2) * 0.8;
      ctx.fillStyle = theme.pitch;
      ctx.beginPath();
      ctx.arc(geom.xForMidi(p.midi), RIBBON_H - 12, p.uncertain ? 2 : 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // --- white keys ---
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (const k of geom.keys) {
    if (k.black) continue;
    const on = active === k.midi;
    ctx.fillStyle = theme.keyWhite;
    ctx.fillRect(k.x + 0.5, keyTop, k.w - 1, keyH);
    if (on) {
      ctx.fillStyle = s.uncertain ? 'rgba(0,212,200,0.25)' : theme.live;
      ctx.fillRect(k.x + 0.5, keyTop, k.w - 1, keyH);
      if (s.uncertain) {
        hatch(ctx, k.x + 0.5, keyTop, k.w - 1, keyH, theme.live);
        ctx.strokeStyle = theme.live;
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 2;
        ctx.strokeRect(k.x + 1.5, keyTop + 1, k.w - 3, keyH - 2);
        ctx.setLineDash([]);
      }
    }
    // Label: octave-numbered C on every octave, letter names when there is room.
    const { name, label } = midiToName(k.midi);
    if (name === 'C' || k.w >= 22) {
      ctx.fillStyle = on && !s.uncertain ? theme.void : '#3A4352';
      ctx.font = `${name === 'C' ? 600 : 400} ${Math.min(12, Math.max(9, k.w * 0.45))}px ${theme.mono}`;
      ctx.fillText(name === 'C' ? label : name, k.x + k.w / 2, h - 7);
    }
  }
  // --- black keys ---
  for (const k of geom.keys) {
    if (!k.black) continue;
    const on = active === k.midi;
    ctx.fillStyle = theme.keyBlack;
    ctx.fillRect(k.x, keyTop, k.w, blackH);
    if (on) {
      ctx.fillStyle = s.uncertain ? 'rgba(0,212,200,0.35)' : theme.live;
      ctx.fillRect(k.x, keyTop, k.w, blackH);
      if (s.uncertain) {
        hatch(ctx, k.x, keyTop, k.w, blackH, theme.live);
        ctx.strokeStyle = theme.live;
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(k.x + 1, keyTop + 1, k.w - 2, blackH - 2);
        ctx.setLineDash([]);
      }
    }
  }

  // --- pitch marker in the ribbon + cents indicator on the key ---
  if (s.midi !== null) {
    const clamped = s.midi < geom.low || s.midi > geom.high;
    const x = geom.xForMidi(s.midi);
    ctx.fillStyle = theme.pitch;
    ctx.strokeStyle = theme.pitch;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 4);
    ctx.lineTo(x, RIBBON_H - 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, RIBBON_H - 12, 5, 0, Math.PI * 2);
    s.uncertain ? ctx.stroke() : ctx.fill();
    if (clamped) {
      ctx.font = `11px ${theme.mono}`;
      ctx.fillStyle = theme.gold;
      ctx.textAlign = s.midi < geom.low ? 'left' : 'right';
      const msg = s.midi < geom.low ? `◀ below ${midiToName(geom.low).label}` : `above ${midiToName(geom.high).label} ▶`;
      ctx.fillText(msg, s.midi < geom.low ? 28 : w - 28, 14);
    }
  } else {
    ctx.font = `11px ${theme.mono}`;
    ctx.fillStyle = theme.dim;
    ctx.textAlign = 'center';
    ctx.fillText(s.hasSession ? 'no steady pitch' : 'waiting for a session', w / 2, 14);
  }
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

const GL = 46; // left gutter for axis labels
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

function yMapper(s: Pick<GraphState, 'scale' | 'lowMidi' | 'highMidi' | 'a4'>, box: PlotBox) {
  if (s.scale === 'semitone') {
    return (hz: number) => {
      const m = freqToMidiFloat(hz, s.a4) ?? s.lowMidi;
      return box.top + (1 - (m - s.lowMidi) / (s.highMidi - s.lowMidi)) * box.plotH;
    };
  }
  const fLo = midiToFreq(s.lowMidi, s.a4);
  const fHi = midiToFreq(s.highMidi, s.a4);
  return (hz: number) => box.top + (1 - (hz - fLo) / (fHi - fLo)) * box.plotH;
}

function drawYAxis(ctx: CanvasRenderingContext2D, s: Pick<GraphState, 'scale' | 'lowMidi' | 'highMidi' | 'a4' | 'theme'>, box: PlotBox, w: number): void {
  const y = yMapper(s, box);
  ctx.font = `10px ${s.theme.mono}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 1;
  if (s.scale === 'semitone') {
    for (let m = s.lowMidi; m <= s.highMidi; m++) {
      const isC = m % 12 === 0;
      const isG = m % 12 === 7 || m % 12 === 4;
      if (!isC && !isG) continue;
      const yy = y(midiToFreq(m, s.a4));
      ctx.strokeStyle = isC ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.05)';
      ctx.beginPath();
      ctx.moveTo(box.left, yy);
      ctx.lineTo(w - GR, yy);
      ctx.stroke();
      if (isC || (s.highMidi - s.lowMidi) <= 24) {
        ctx.fillStyle = isC ? s.theme.text : s.theme.dim;
        ctx.fillText(midiToName(m).label, box.left - 6, yy);
      }
    }
  } else {
    const fLo = midiToFreq(s.lowMidi, s.a4);
    const fHi = midiToFreq(s.highMidi, s.a4);
    const step = fHi - fLo > 600 ? 100 : 50;
    for (let f = Math.ceil(fLo / step) * step; f <= fHi; f += step) {
      const yy = y(f);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.moveTo(box.left, yy);
      ctx.lineTo(w - GR, yy);
      ctx.stroke();
      ctx.fillStyle = s.theme.dim;
      ctx.fillText(`${f} Hz`, box.left - 6, yy);
    }
  }
}

export function drawPitchGraph(ctx: CanvasRenderingContext2D, w: number, h: number, s: GraphState): void {
  const { theme, log } = s;
  const box = plotBox(w, h);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = theme.surface;
  ctx.fillRect(box.left, box.top, box.plotW, box.plotH);
  drawYAxis(ctx, s, box, w);

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

export function drawContourChart(ctx: CanvasRenderingContext2D, w: number, h: number, s: ContourChartState): void {
  const { theme } = s;
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
    drawYAxis(ctx, s, box, w);
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
