import { useEffect, useRef } from 'react';
import type { MicEngine } from '../audio/micEngine';
import { useCanvasSize, useReducedMotion } from '../hooks/hooks';
import { freqToMidiFloat } from '../pitch/notes';
import type { Prefs } from '../storage/prefs';
import { drawKeyboard, drawPitchGraph } from '../visualization/draw';
import { buildKeyboard, cMidi } from '../visualization/keyboard';
import { readTheme } from '../visualization/theme';

interface Props {
  engine: MicEngine;
  prefs: Prefs;
  /** When set, the graph window ends at this session time instead of "now". */
  frozenAt: number | null;
  hasSession: boolean;
}

/** Keyboard + pitch graph + level meter, all drawn from one requestAnimationFrame loop. */
export function LiveViz({ engine, prefs, frozenAt, hasSession }: Props) {
  const kbRef = useRef<HTMLCanvasElement>(null);
  const graphRef = useRef<HTMLCanvasElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const kbSize = useCanvasSize(kbRef);
  const graphSize = useCanvasSize(graphRef);
  const reduced = useReducedMotion();
  const hover = useRef<number | null>(null);

  // Latest props for the animation loop without restarting it on every change.
  const live = useRef({ prefs, frozenAt, hasSession, reduced });
  live.current = { prefs, frozenAt, hasSession, reduced };

  useEffect(() => {
    const kb = kbRef.current;
    const gr = graphRef.current;
    if (!kb || !gr) return;
    const kctx = kb.getContext('2d');
    const gctx = gr.getContext('2d');
    if (!kctx || !gctx) return;
    const theme = readTheme();
    let raf = 0;
    let lastDraw = 0;
    let level = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const { prefs: p, frozenAt: fz, hasSession: has, reduced: rm } = live.current;
      if (rm && now - lastDraw < 100) return; // ~10 fps under reduced motion
      lastDraw = now;

      const log = engine.log;
      const latest = engine.latest;
      const lowMidi = cMidi(p.lowOctave);
      const highMidi = lowMidi + p.octaves * 12;

      // Keyboard
      const ks = kbSize.current;
      if (ks.w > 0) {
        kctx.setTransform(ks.dpr, 0, 0, ks.dpr, 0, 0);
        const geom = buildKeyboard(p.lowOctave, p.octaves, ks.w);
        const tNow = engine.elapsedSec();
        const trail: { midi: number; age: number; uncertain: boolean }[] = [];
        for (let i = log.length - 1; i >= 0 && trail.length < 40; i -= 2) {
          const age = tNow - log.t[i];
          if (age > 1.2) break;
          const m = log.f0[i] > 0 ? freqToMidiFloat(log.f0[i], p.a4) : null;
          if (m !== null) trail.push({ midi: m, age, uncertain: (log.flags[i] & 2) !== 0 });
        }
        const fresh = engine.status === 'running' && latest.f0 > 0;
        drawKeyboard(kctx, ks.w, ks.h, {
          geom,
          theme,
          midi: fresh ? freqToMidiFloat(latest.f0, p.a4) : null,
          uncertain: latest.uncertain,
          trail,
          reducedMotion: rm,
          hasSession: has,
        });
      }

      // Pitch graph
      const gs = graphSize.current;
      if (gs.w > 0) {
        gctx.setTransform(gs.dpr, 0, 0, gs.dpr, 0, 0);
        drawPitchGraph(gctx, gs.w, gs.h, {
          theme,
          log,
          tEnd: fz ?? engine.elapsedSec(),
          windowSec: p.graphWindowSec,
          scale: p.graphScale,
          lowMidi,
          highMidi,
          a4: p.a4,
          hoverX: hover.current,
          frozen: fz !== null,
          reducedMotion: rm,
        });
      }

      // Level meter: relative dB mapped over a 60 dB span, with fast attack and slow release.
      const db = latest.rms > 0 ? 20 * Math.log10(latest.rms) : -90;
      const target = Math.min(1, Math.max(0, (db + 60) / 60));
      level = target > level ? target : level * 0.88 + target * 0.12;
      if (meterRef.current) meterRef.current.style.transform = `scaleX(${level.toFixed(3)})`;
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [engine, kbSize, graphSize]);

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    hover.current = e.clientX - e.currentTarget.getBoundingClientRect().left;
  };
  const onLeave = () => {
    hover.current = null;
  };

  return (
    <div className="viz">
      <canvas
        ref={kbRef}
        className="kb-canvas"
        role="img"
        aria-label="Piano keyboard. The key for your current pitch is highlighted; the current note is also shown in text below."
      />
      <canvas
        ref={graphRef}
        className="graph-canvas"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={onLeave}
        onPointerCancel={onLeave}
        role="img"
        aria-label="Scrolling pitch graph: pitch over time. Solid line is a confident reading, dashed is uncertain. The strip below marks voiced speech, speech without steady pitch, and silence."
      />
      <div className="meter" aria-hidden="true">
        <span className="meter-label">Level (relative)</span>
        <div className="meter-track">
          <div className="meter-fill" ref={meterRef} />
        </div>
      </div>
      <ul className="legend" aria-label="Graph legend">
        <li><i className="sw sw-line" /> confident pitch</li>
        <li><i className="sw sw-dash" /> uncertain (dashed / hatched key)</li>
        <li><i className="sw sw-voiced" /> voiced</li>
        <li><i className="sw sw-speech" /> speech, no steady pitch</li>
        <li><i className="sw sw-silent" /> silence</li>
      </ul>
    </div>
  );
}
