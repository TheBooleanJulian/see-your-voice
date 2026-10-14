import { useRef } from 'react';
import type { EngineStatus, MicEngine } from '../audio/micEngine';
import { useTicker } from '../hooks/hooks';
import { formatCents, freqToNote } from '../pitch/notes';
import { summarizePitch, type PitchSummary } from '../pitch/stats';
import { fmtDuration, fmtNum } from './format';

interface Props {
  engine: MicEngine;
  status: EngineStatus;
  a4: number;
  /** Seconds, shown as a countdown when set. */
  limitSec?: number;
}

export function Readouts({ engine, status, a4, limitSec }: Props) {
  useTicker(100, status === 'running' || status === 'paused');
  const cache = useRef<{ at: number; len: number; s: PitchSummary | null }>({ at: 0, len: -1, s: null });

  const l = engine.latest;
  const log = engine.log;
  const now = performance.now();
  if (now - cache.current.at > 1000 && log.length !== cache.current.len) {
    cache.current = { at: now, len: log.length, s: summarizePitch(log.f0.subarray(0, log.length)) };
  }
  const stats = cache.current.s;

  const live = status === 'running';
  const note = live && l.f0 > 0 ? freqToNote(l.f0, a4) : null;
  const state = !live
    ? status === 'paused'
      ? 'Paused'
      : 'Ready'
    : l.f0 > 0
      ? l.uncertain
        ? 'Voiced (uncertain)'
        : 'Voiced'
      : l.active
        ? 'Speech, no steady pitch'
        : 'Silence';

  const elapsed = engine.elapsedSec();
  const timer = limitSec ? `${fmtDuration(Math.max(0, limitSec - elapsed))} left` : fmtDuration(elapsed);

  return (
    <div className="readouts">
      <div className="tile tile-note">
        <span className="tile-label">Note</span>
        <span className="tile-value" aria-live="off">
          {note ? note.label : '—'}
        </span>
        <span className="tile-sub">{note ? formatCents(note.cents) : ' '}</span>
      </div>
      <div className="tile">
        <span className="tile-label">Pitch (F0)</span>
        <span className="tile-value mono">{live && l.f0 > 0 ? `${l.f0.toFixed(0)} Hz` : '—'}</span>
        <span className="tile-sub">estimated</span>
      </div>
      <div className="tile">
        <span className="tile-label">Confidence</span>
        <span className="tile-value mono">{live && l.f0 > 0 ? `${Math.round(l.conf * 100)}%` : '—'}</span>
        <span className="conf-bar" aria-hidden="true">
          <i style={{ width: `${live && l.f0 > 0 ? l.conf * 100 : 0}%` }} />
        </span>
      </div>
      <div className="tile">
        <span className="tile-label">Voice</span>
        <span className={`pill ${live && l.active ? 'pill-on' : ''}`}>
          <i aria-hidden="true" />
          {state}
        </span>
        <span className="tile-sub">{live ? `level ${fmtNum(l.rms * 100, 0)} (relative)` : ' '}</span>
      </div>
      <div className="tile">
        <span className="tile-label">{limitSec ? 'Time remaining' : 'Session time'}</span>
        <span className="tile-value mono">{timer}</span>
        <span className="tile-sub">{status === 'paused' ? 'paused' : live ? 'recording' : ' '}</span>
      </div>
      <div className="tile tile-wide">
        <span className="tile-label">This session (estimates)</span>
        <span className="tile-stats mono">
          <span>min {stats ? `${stats.minHz.toFixed(0)} Hz` : '—'}</span>
          <span>max {stats ? `${stats.maxHz.toFixed(0)} Hz` : '—'}</span>
          <span>range {stats ? `${stats.rangeSemitones.toFixed(1)} st` : '—'}</span>
        </span>
        <span className="tile-sub">range = 5th–95th percentile, in semitones (st)</span>
      </div>
    </div>
  );
}
