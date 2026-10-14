import { useEffect, useRef } from 'react';
import type { MicEngine } from '../audio/micEngine';
import { useCanvasSize, useReducedMotion } from '../hooks/hooks';
import type { Prefs } from '../storage/prefs';
import { drawPitchGraph } from '../visualization/draw';
import { cMidi } from '../visualization/keyboard';
import { readTheme } from '../visualization/theme';

interface Props {
  engine: MicEngine;
  prefs: Prefs;
  /** When set, the graph window ends at this session time instead of "now". */
  frozenAt: number | null;
}

/** Pitch graph with a piano-roll keyboard axis + level meter, all drawn from one requestAnimationFrame loop. */
export function LiveViz({ engine, prefs, frozenAt }: Props) {
  const graphRef = useRef<HTMLCanvasElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const graphSize = useCanvasSize(graphRef);
  const reduced = useReducedMotion();
  const hover = useRef<number | null>(null);

  // Latest props for the animation loop without restarting it on every change.
  const live = useRef({ prefs, frozenAt, reduced });
  live.current = { prefs, frozenAt, reduced };

  useEffect(() => {
    const gr = graphRef.current;
    if (!gr) return;
    const gctx = gr.getContext('2d');
    if (!gctx) return;
    const theme = readTheme();
    let raf = 0;
    let lastDraw = 0;
    let level = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const { prefs: p, frozenAt: fz, reduced: rm } = live.current;
      if (rm && now - lastDraw < 100) return; // ~10 fps under reduced motion
      lastDraw = now;

      const log = engine.log;
      const latest = engine.latest;
      const lowMidi = cMidi(p.lowOctave);
      const highMidi = lowMidi + p.octaves * 12;

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
  }, [engine, graphSize]);

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    hover.current = e.clientX - e.currentTarget.getBoundingClientRect().left;
  };
  const onLeave = () => {
    hover.current = null;
  };

  return (
    <div className="viz">
      <canvas
        ref={graphRef}
        className="graph-canvas"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={onLeave}
        onPointerCancel={onLeave}
        role="img"
        aria-label="Scrolling pitch graph with a piano keyboard down its left edge: pitch over time, with the key for your current pitch highlighted. Solid line is a confident reading, dashed is uncertain. The strip below marks voiced speech, speech without steady pitch, and silence."
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
