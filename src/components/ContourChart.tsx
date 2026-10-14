import { useEffect, useRef } from 'react';
import { useCanvasSize } from '../hooks/hooks';
import type { Prefs } from '../storage/prefs';
import { drawContourChart, PLOT_LEFT, type ContourSeries } from '../visualization/draw';
import { cMidi } from '../visualization/keyboard';
import { readTheme } from '../visualization/theme';

interface Props {
  series: ContourSeries[];
  durationSec: number;
  mode: 'absolute' | 'relative';
  prefs: Prefs;
  playhead?: number | null;
  pauses?: { startSec: number; durSec: number }[];
  /** Short text description for assistive tech. */
  description: string;
  height?: number;
  /** Seek callback when the chart is clicked/tapped. */
  onSeek?: (sec: number) => void;
}

export function ContourChart({ series, durationSec, mode, prefs, playhead = null, pauses, description, height = 220, onSeek }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const size = useCanvasSize(ref);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const draw = () => {
      const s = size.current;
      if (s.w === 0) return;
      ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
      const lowMidi = cMidi(prefs.lowOctave);
      drawContourChart(ctx, s.w, s.h, {
        theme: readTheme(),
        series,
        durationSec,
        mode,
        scale: prefs.graphScale,
        lowMidi,
        highMidi: lowMidi + prefs.octaves * 12,
        a4: prefs.a4,
        playhead,
        pauses,
      });
    };
    draw();
    const ro = new ResizeObserver(() => requestAnimationFrame(draw));
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [series, durationSec, mode, prefs, playhead, pauses, size]);

  const onClick = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const plotLeft = PLOT_LEFT;
    const plotW = rect.width - PLOT_LEFT - 10;
    const frac = (e.clientX - rect.left - plotLeft) / plotW;
    if (frac >= 0 && frac <= 1) onSeek(frac * durationSec);
  };

  return (
    <canvas
      ref={ref}
      className="contour-canvas"
      style={{ height }}
      role="img"
      aria-label={description}
      onPointerDown={onClick}
    />
  );
}
