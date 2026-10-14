import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePrefs } from '../hooks/hooks';
import { freqToNote } from '../pitch/notes';
import { suggest } from '../practice/suggestions';
import { MODE_LABELS, type SessionRecord } from '../sessions/types';
import { ContourChart } from './ContourChart';
import { fmtDate, fmtDuration, fmtNum } from './format';
import { TranscriptView } from './TranscriptView';

interface Props {
  record: SessionRecord;
  audio: Blob | null;
  children?: ReactNode;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value mono">{value}</span>
      {hint ? <span className="stat-hint">{hint}</span> : null}
    </div>
  );
}

function usePlayback(audio: Blob | null) {
  const el = useRef<HTMLAudioElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [time, setTime] = useState<number | null>(null);

  useEffect(() => {
    if (!audio) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(audio);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [audio]);

  useEffect(() => {
    const a = el.current;
    if (!a || !url) return;
    let raf = 0;
    const loop = () => {
      setTime(a.currentTime);
      raf = requestAnimationFrame(loop);
    };
    const onPlay = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    };
    const onStop = () => {
      cancelAnimationFrame(raf);
      setTime(a.currentTime);
    };
    // MediaRecorder WebM has no duration header: nudge the element so seeking works.
    const onMeta = () => {
      if (a.duration === Infinity) {
        a.currentTime = 1e7;
        a.addEventListener(
          'timeupdate',
          () => {
            a.currentTime = 0;
          },
          { once: true },
        );
      }
    };
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onStop);
    a.addEventListener('ended', onStop);
    a.addEventListener('seeked', onStop);
    a.addEventListener('loadedmetadata', onMeta);
    return () => {
      cancelAnimationFrame(raf);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onStop);
      a.removeEventListener('ended', onStop);
      a.removeEventListener('seeked', onStop);
      a.removeEventListener('loadedmetadata', onMeta);
    };
  }, [url]);

  return { el, url, time, seek: (sec: number) => el.current && (el.current.currentTime = sec) };
}

export function SessionReport({ record, audio, children }: Props) {
  const { prefs } = usePrefs();
  const m = record.metrics;
  const pb = usePlayback(audio);
  const series = useMemo(() => [{ label: 'This session', color: '#A78BFA', contour: record.contour }], [record.contour]);
  const tips = useMemo(() => suggest(m), [m]);
  const median = m.pitch ? freqToNote(m.pitch.medianHz, prefs.a4) : null;

  return (
    <section className="report" aria-label="Session report">
      <header className="report-head">
        <h2>{record.label}</h2>
        <p className="muted">
          {fmtDate(record.createdAt)} · {fmtDuration(record.durationSec)} · {MODE_LABELS[record.mode]}
          {record.intent ? ` · ${record.intent}` : ''}
        </p>
      </header>

      {pb.url ? (
        <div className="player">
          <audio ref={pb.el} src={pb.url} controls preload="metadata" aria-label="Replay your recording" />
        </div>
      ) : (
        <p className="muted small">No audio was recorded for this session (recording is opt-in).</p>
      )}

      <ContourChart
        series={series}
        durationSec={record.durationSec}
        mode="absolute"
        prefs={prefs}
        playhead={pb.time}
        pauses={m.pauses}
        onSeek={audio ? pb.seek : undefined}
        description={`Pitch contour of the session over ${Math.round(record.durationSec)} seconds. Shaded bands are pauses.`}
      />
      <p className="muted small">Shaded bands are pauses (0.3 s or longer between phrases).{audio ? ' Click the chart to jump in the recording.' : ''}</p>

      <div className="report-grid">
        <article className="card">
          <h3>Vocal variation</h3>
          {m.pitch ? (
            <>
              <div className="stats">
                <Stat label="Median pitch" value={`${m.pitch.medianHz.toFixed(0)} Hz`} hint={median ? `≈ ${median.label}` : undefined} />
                <Stat label="Range (5–95th pct)" value={`${m.pitch.rangeSemitones.toFixed(1)} st`} hint={`${m.pitch.minHz.toFixed(0)}–${m.pitch.maxHz.toFixed(0)} Hz raw`} />
                <Stat label="Variation (std dev)" value={`${m.pitch.stdSemitones.toFixed(1)} st`} />
                <Stat label="Near median (±1.5 st)" value={`${Math.round(m.pitch.nearMedianFraction * 100)}%`} />
              </div>
              <h4>Time by pitch band</h4>
              <ul className="bands">
                {m.pitch.bands.map((b) => (
                  <li key={b.label}>
                    <span>{b.label}</span>
                    <span className="band-bar" aria-hidden="true">
                      <i style={{ width: `${b.fraction * 100}%` }} />
                    </span>
                    <span className="mono">{Math.round(b.fraction * 100)}%</span>
                  </li>
                ))}
              </ul>
              <p className="muted small">
                Pitch variation describes how your voice moves, not how good it sounds. Lively delivery usually shows movement on key
                words; neither a very wide nor a very narrow range is automatically better. st = semitones.
              </p>
            </>
          ) : (
            <p className="muted">No steady pitch was detected. Try speaking closer to the microphone or lowering the silence threshold in Settings.</p>
          )}
        </article>

        <article className="card">
          <h3>Cadence</h3>
          {m.rate ? (
            <>
              <div className="stats">
                <Stat
                  label="Estimated speaking rate"
                  value={m.rate.wpmSpeaking !== null ? `${Math.round(m.rate.wpmSpeaking)} wpm` : '—'}
                  hint="pauses excluded"
                />
                <Stat label="Overall rate" value={m.rate.wpmOverall !== null ? `${Math.round(m.rate.wpmOverall)} wpm` : '—'} hint="pauses included" />
                <Stat label="Words" value={String(m.rate.words)} hint={m.rate.source === 'transcript' ? 'recognised' : 'from passage length'} />
                <Stat label="Speaking bursts" value={String(m.segments.length)} hint={`${m.speakingSec.toFixed(0)} s speaking`} />
              </div>
              {m.rate.source === 'passage' ? (
                <p className="muted small">Rate assumes you read the whole passage; turn on transcription for a measured rate.</p>
              ) : (
                <p className="muted small">Speech recognition accuracy varies with accent, microphone and noise, so treat the rate as an estimate.</p>
              )}
              {m.rate.paceSeries.length > 1 ? (
                <>
                  <h4>Pace over time (15 s windows)</h4>
                  <ul className="bands">
                    {m.rate.paceSeries.map((p) => (
                      <li key={p.t}>
                        <span className="mono">{fmtDuration(p.t)}</span>
                        <span className="band-bar" aria-hidden="true">
                          <i style={{ width: `${Math.min(100, (p.wpm / 240) * 100)}%` }} />
                        </span>
                        <span className="mono">{Math.round(p.wpm)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          ) : (
            <>
              <div className="stats">
                <Stat label="Speaking bursts" value={String(m.segments.length)} hint={`${m.speakingSec.toFixed(0)} s speaking`} />
                <Stat label="Speaking rate" value="—" hint="needs transcription" />
              </div>
              <p className="muted small">Turn on transcription before recording to estimate words per minute.</p>
            </>
          )}
        </article>

        <article className="card">
          <h3>Pauses</h3>
          <div className="stats">
            <Stat label="Pauses" value={String(m.pauseStats.count)} hint="≥ 0.3 s between phrases" />
            <Stat label="Average" value={fmtNum(m.pauseStats.meanSec, 1, ' s')} />
            <Stat label="Longest" value={fmtNum(m.pauseStats.longestSec, 1, ' s')} />
            <Stat label="Per minute" value={fmtNum(m.pauseStats.perMinute, 1)} hint={`${m.pauseStats.longCount} long (≥ 1 s)`} />
          </div>
          <p className="muted small">Pauses are not errors: well-placed ones give listeners time to absorb a point.</p>
        </article>

        <article className="card">
          <h3>Fillers</h3>
          {m.fillers ? (
            <>
              <div className="stats">
                <Stat label="Detected" value={String(m.fillers.total)} />
                <Stat label="Per 100 words" value={m.fillers.per100 !== null ? m.fillers.per100.toFixed(1) : '—'} hint={m.fillers.per100 === null ? 'needs 30+ words' : undefined} />
              </div>
              {Object.keys(m.fillers.byPhrase).length ? (
                <p className="small">
                  {Object.entries(m.fillers.byPhrase)
                    .map(([k, v]) => `“${k}” ×${v}`)
                    .join(' · ')}
                </p>
              ) : null}
              <p className="muted small">
                Speech engines often drop “um” and “uh” from transcripts, so counts for those are likely low. Words like “like” are only counted
                when the context suggests a filler.
              </p>
            </>
          ) : (
            <p className="muted">Filler detection needs a transcript. Turn on transcription before recording; nothing is guessed from pitch alone.</p>
          )}
        </article>

        {m.loudness ? (
          <article className="card">
            <h3>Volume consistency</h3>
            <div className="stats">
              <Stat label="Level variation" value={`${m.loudness.variationDb.toFixed(1)} dB`} hint="relative, uncalibrated" />
            </div>
            <p className="muted small">Microphone level only: not sound pressure, and affected by how far you sit from the mic.</p>
          </article>
        ) : null}

        <article className="card card-accent">
          <h3>Next exercise</h3>
          <ul className="tips">
            {tips.map((t) => (
              <li key={t.title}>
                <strong>{t.title}</strong>
                <span className="small">{t.evidence}</span>
                <span className="small muted">{t.drillText}</span>
                <a className="link small" href={`#/practice/${t.drill}`}>
                  Open {MODE_LABELS[t.drill]} →
                </a>
              </li>
            ))}
          </ul>
          <p className="muted small">Rule-of-thumb suggestions from the measurements above; not a judgement of your communication.</p>
        </article>
      </div>

      {record.transcript ? (
        <article className="card">
          <h3>Transcript</h3>
          <TranscriptView segments={record.transcript} fillers={record.fillerList} />
          <p className="muted small">Highlighted words are detected fillers. Underlined phrases had low recognition confidence (which can reflect noise or accent, not just enunciation).</p>
        </article>
      ) : null}

      {children}
    </section>
  );
}
