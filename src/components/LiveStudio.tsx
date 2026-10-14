import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { audioSupported } from '../audio/micEngine';
import { usePrefs, useTicker } from '../hooks/hooks';
import { buildSessionRecord } from '../sessions/build';
import { SessionController } from '../sessions/controller';
import type { PracticeMode, SessionRecord } from '../sessions/types';
import { webSpeechSupported } from '../speech/recognition';
import { getRepo } from '../storage/repo';
import { LiveViz } from './LiveViz';
import { MicSelect } from './MicSelect';
import { Readouts } from './Readouts';
import { SessionReport } from './SessionReport';
import { TranscriptView } from './TranscriptView';

export interface StudioPassage {
  id: string;
  title: string;
  wordCount: number;
}

interface Props {
  mode: PracticeMode;
  label: string;
  passage?: StudioPassage | null;
  /** Stop automatically after this many seconds (timed practice). */
  autoStopSec?: number;
  intent?: string;
  onFinished?: (record: SessionRecord, audio: Blob | null) => void;
  /** True while the microphone is being requested or is live, so the parent can lock its inputs. */
  onBusyChange?: (busy: boolean) => void;
  renderExtra?: (record: SessionRecord) => ReactNode;
}

const MIN_ANALYSABLE_SEC = 2;

const STATUS_TEXT = {
  idle: 'Microphone off',
  requesting: 'Waiting for microphone permission',
  running: 'Recording: microphone is on',
  paused: 'Paused: microphone is muted',
  stopped: 'Stopped: microphone is off',
  error: 'Microphone off',
} as const;

export function LiveStudio({ mode, label, passage, autoStopSec, intent, onFinished, onBusyChange, renderExtra }: Props) {
  const { prefs } = usePrefs();
  const [ctrl] = useState(() => new SessionController());
  const snap = useSyncExternalStore(ctrl.subscribe, ctrl.getSnapshot);
  const [recordAudio, setRecordAudio] = useState(false);
  const [transcribe, setTranscribe] = useState(false);
  const [frozenAt, setFrozenAt] = useState<number | null>(null);
  const [result, setResult] = useState<{ record: SessionRecord; audio: Blob | null } | null>(null);
  const [tooShort, setTooShort] = useState(false);
  const [save, setSave] = useState<{ state: 'idle' | 'saving' | 'saved' | 'error'; note?: string }>({ state: 'idle' });
  const finalized = useRef(false);
  const support = audioSupported();
  const speechOk = webSpeechSupported();

  const active = snap.status === 'running' || snap.status === 'paused';
  const trackerCfg = { minHz: prefs.minHz, maxHz: prefs.maxHz, yinThreshold: prefs.yinThreshold, silenceRms: prefs.silenceRms };

  const busy = snap.status === 'requesting' || active;
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  // Release the microphone and every node when leaving the screen.
  useEffect(() => () => ctrl.dispose(), [ctrl]);

  // Apply detection settings live.
  useEffect(() => {
    ctrl.engine.setConfig({ minHz: prefs.minHz, maxHz: prefs.maxHz, yinThreshold: prefs.yinThreshold, silenceRms: prefs.silenceRms });
  }, [ctrl, prefs.minHz, prefs.maxHz, prefs.yinThreshold, prefs.silenceRms]);

  // A refresh or tab close while recording would lose the session: ask first.
  useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [active]);

  // Timed practice: stop when the time is up.
  const timerTick = useTicker(250, snap.status === 'running' && !!autoStopSec);
  useEffect(() => {
    if (autoStopSec && ctrl.engine.status === 'running' && ctrl.engine.elapsedSec() >= autoStopSec) void ctrl.stop();
  }, [timerTick, autoStopSec, ctrl]);

  // Build the report once per session, whether the user pressed Stop or the engine stopped itself.
  useEffect(() => {
    if (snap.status !== 'stopped' || finalized.current) return;
    finalized.current = true;
    const res = ctrl.engine.getResult();
    if (!res) return;
    if (res.durationSec < MIN_ANALYSABLE_SEC) {
      setTooShort(true);
      return;
    }
    const s = ctrl.getSnapshot();
    const record = buildSessionRecord({
      contour: ctrl.engine.log.toContour(),
      durationSec: res.durationSec,
      hasAudio: !!res.audio,
      transcript: s.segments,
      fillerList: prefs.fillers,
      mode,
      label,
      passageId: passage?.id,
      passageTitle: passage?.title,
      passageWordCount: passage?.wordCount,
      intent,
    });
    setResult({ record, audio: res.audio });
    onFinished?.(record, res.audio);
  }, [snap.status]);

  const start = async () => {
    finalized.current = false;
    setResult(null);
    setTooShort(false);
    setFrozenAt(null);
    setSave({ state: 'idle' });
    await ctrl.start({ deviceId: prefs.deviceId, record: recordAudio, transcribe: transcribe && speechOk, lang: prefs.lang, config: trackerCfg });
  };

  const saveSession = async () => {
    if (!result) return;
    setSave({ state: 'saving' });
    try {
      const repo = await getRepo();
      await repo.save(result.record, result.audio);
      setSave({
        state: 'saved',
        note: repo.persistent ? undefined : 'Browser storage is unavailable, so this is only kept until you close the tab.',
      });
    } catch (err) {
      setSave({ state: 'error', note: err instanceof Error ? err.message : 'Could not save the session.' });
    }
  };

  const badge =
    snap.status === 'running'
      ? { cls: 'rec-on', text: 'Recording' }
      : snap.status === 'paused'
        ? { cls: 'rec-paused', text: 'Paused' }
        : snap.status === 'requesting'
          ? { cls: 'rec-wait', text: 'Waiting for permission' }
          : { cls: 'rec-off', text: 'Mic off' };

  return (
    <div className="studio">
      <div className="studio-top">
        <span className={`rec-badge ${badge.cls}`}>
          <i aria-hidden="true" />
          {badge.text}
        </span>
        <p className="sr-only" role="status" aria-live="polite">
          {STATUS_TEXT[snap.status]}
        </p>
      </div>

      {!support.ok ? (
        <div className="banner banner-error" role="alert">
          {support.reason} You can still browse the app, but live analysis needs a supported browser.
        </div>
      ) : null}
      {snap.error ? (
        <div className="banner banner-error" role="alert">
          {snap.error}
        </div>
      ) : null}
      {snap.notice ? (
        <div className="banner banner-info" role="status">
          {snap.notice}
        </div>
      ) : null}
      {snap.interrupted ? (
        <div className="banner banner-warn" role="alert">
          Audio was interrupted (the browser suspended it, or another app took the microphone).
          <button type="button" className="btn btn-sm" onClick={() => void ctrl.engine.recoverContext()}>
            Resume audio
          </button>
        </div>
      ) : null}
      {snap.transcriptionError ? (
        <div className="banner banner-warn" role="status">
          {snap.transcriptionError} Pitch analysis is unaffected.
        </div>
      ) : null}

      <Readouts engine={ctrl.engine} status={snap.status} a4={prefs.a4} limitSec={autoStopSec} />
      <LiveViz engine={ctrl.engine} prefs={prefs} frozenAt={frozenAt} hasSession={snap.status !== 'idle'} />

      <div className="controls" role="group" aria-label="Recording controls">
        {!active ? (
          <button type="button" className="btn btn-primary" onClick={start} disabled={!support.ok || snap.status === 'requesting'}>
            {snap.status === 'requesting' ? 'Waiting for microphone…' : snap.status === 'stopped' ? 'Record again' : 'Start'}
          </button>
        ) : (
          <>
            {snap.status === 'running' ? (
              <button type="button" className="btn" onClick={() => ctrl.pause()}>
                Pause
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => void ctrl.resume()}>
                Resume
              </button>
            )}
            <button type="button" className="btn btn-stop" onClick={() => void ctrl.stop()}>
              Stop
            </button>
          </>
        )}
        <button
          type="button"
          className="btn btn-ghost"
          aria-pressed={frozenAt !== null}
          onClick={() => setFrozenAt(frozenAt === null ? ctrl.engine.elapsedSec() : null)}
        >
          {frozenAt === null ? 'Freeze graph' : 'Unfreeze graph'}
        </button>
        {snap.status === 'requesting' ? (
          <button type="button" className="btn btn-ghost" onClick={() => void ctrl.stop()}>
            Cancel
          </button>
        ) : null}
        {!active && snap.status !== 'requesting' ? (
          <p className="small muted consent-line">Pressing Start turns on your microphone (the browser will ask). Audio stays on this device.</p>
        ) : null}
      </div>

      {!active && snap.status !== 'requesting' ? (
        <div className="panel prestart">
          <h3>Before you start</h3>
          <p className="small">
            SeeYourVoice needs your microphone to show your pitch live. Your browser will ask permission when you press{' '}
            <strong>Start</strong>. Audio is analysed on this device and is not uploaded.
          </p>
          <MicSelect disabled={active} />
          <label className="check">
            <input type="checkbox" checked={recordAudio} onChange={(e) => setRecordAudio(e.target.checked)} />
            <span>
              Record audio so I can replay it
              <small>Stays on this device. You choose afterwards whether to save it.</small>
            </span>
          </label>
          <label className="check">
            <input type="checkbox" checked={transcribe && speechOk} disabled={!speechOk} onChange={(e) => setTranscribe(e.target.checked)} />
            <span>
              Transcribe my speech (words per minute, fillers)
              <small>
                {speechOk
                  ? 'Uses your browser’s speech recognition. In Chrome and Edge this sends your audio to the browser vendor’s speech service. Leave it off to keep everything on this device.'
                  : 'Not supported in this browser (try Chrome or Edge). Pitch, pauses and everything else still work.'}
              </small>
            </span>
          </label>
        </div>
      ) : null}

      {snap.transcribing || snap.segments.length > 0 ? (
        snap.status === 'running' || snap.status === 'paused' ? (
          <div className="panel">
            <h3>Live transcript</h3>
            <TranscriptView segments={snap.segments} fillers={prefs.fillers} interim={snap.interim} />
            {snap.segments.length === 0 && !snap.interim ? <p className="muted small">Listening…</p> : null}
          </div>
        ) : null
      ) : null}

      {tooShort ? (
        <div className="banner banner-info" role="status">
          That session was under {MIN_ANALYSABLE_SEC} seconds, which is too short to analyse. Try again and speak for a little longer.
        </div>
      ) : null}

      {result ? (
        <SessionReport record={result.record} audio={result.audio}>
          {renderExtra?.(result.record)}
          <div className="panel save-bar">
            {save.state === 'saved' ? (
              <p role="status">
                Saved on this device. <a className="link" href="#/sessions">View saved sessions →</a>
                {save.note ? <span className="warn"> {save.note}</span> : null}
              </p>
            ) : (
              <>
                <p className="small muted">
                  This session is not stored yet.{' '}
                  {result.audio ? 'Saving keeps the recording on this device only.' : 'Saving keeps the pitch data and metrics (no audio).'}
                </p>
                <div className="controls">
                  <button type="button" className="btn btn-primary" onClick={saveSession} disabled={save.state === 'saving'}>
                    {save.state === 'saving' ? 'Saving…' : 'Save session'}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setResult(null)} disabled={save.state === 'saving'}>
                    Discard
                  </button>
                </div>
                {save.state === 'error' ? (
                  <p className="warn small" role="alert">
                    {save.note}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </SessionReport>
      ) : null}
    </div>
  );
}
