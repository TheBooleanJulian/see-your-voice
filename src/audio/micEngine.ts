// Microphone lifecycle + continuous analysis.
//
// Analysis runs on a 25 ms timer (not requestAnimationFrame), so visuals can run at display
// rate while pitch analysis runs at ~40 Hz, and a busy/hidden render loop never stalls capture.
// YIN on a decimated 2048-sample buffer is cheap enough to stay on the main thread; all buffers
// are preallocated, so the loop does not allocate per frame.

import { ActivityDetector } from '../speech/vad';
import { CONFIDENT_AT, DEFAULT_TRACKER_CONFIG, PitchTracker, type TrackerConfig } from '../pitch/tracker';
import {
  ANALYSIS_INTERVAL_MS,
  FLAG_ACTIVE,
  FLAG_UNCERTAIN,
  FRAME_CAPACITY,
  FrameLog,
  MAX_SESSION_SEC,
} from './frameLog';

export type EngineStatus = 'idle' | 'requesting' | 'running' | 'paused' | 'stopped' | 'error';
export type StopReason = 'user' | 'device-lost' | 'max-length' | 'error';

export interface EngineSnapshot {
  status: EngineStatus;
  error: string | null;
  /** Non-fatal information for the user (interruptions, fallbacks). */
  notice: string | null;
  stopReason: StopReason | null;
  /** Audio context is suspended/interrupted while we expect it to run. */
  interrupted: boolean;
}

export interface StartOptions {
  deviceId?: string;
  /** Also capture audio with MediaRecorder for local playback. */
  record: boolean;
  config: TrackerConfig;
}

export interface EngineResult {
  durationSec: number;
  audio: Blob | null;
}

export interface LatestReading {
  t: number;
  f0: number;
  conf: number;
  rms: number;
  active: boolean;
  uncertain: boolean;
}

const FFT_SIZE = 2048;
const RECORDER_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

const IDLE: EngineSnapshot = { status: 'idle', error: null, notice: null, stopReason: null, interrupted: false };

export function describeMicError(err: unknown): string {
  const name = err instanceof DOMException || err instanceof Error ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Microphone access was blocked. Allow it in your browser’s site settings (usually the icon beside the address bar), then press Start again.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No microphone was found. Plug one in or check your system sound settings, then try again.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'The microphone is busy or unavailable. Close other apps that may be using it and try again.';
    case 'OverconstrainedError':
      return 'The selected microphone is no longer available. Choose another input in Settings.';
    case 'SecurityError':
      return 'The browser refused microphone access for this page. Microphone capture needs HTTPS (or localhost).';
    default:
      return `Could not start the microphone${err instanceof Error && err.message ? `: ${err.message}` : '.'}`;
  }
}

export function audioSupported(): { ok: boolean; reason?: string } {
  if (typeof window === 'undefined') return { ok: false, reason: 'No browser environment.' };
  if (!window.isSecureContext) return { ok: false, reason: 'Microphone capture needs a secure page (HTTPS or localhost).' };
  if (!navigator.mediaDevices?.getUserMedia) return { ok: false, reason: 'This browser does not support microphone capture.' };
  if (typeof AudioContext === 'undefined') return { ok: false, reason: 'This browser does not support the Web Audio API.' };
  return { ok: true };
}

export async function listAudioInputs(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === 'audioinput');
}

export class MicEngine {
  readonly log = new FrameLog(FRAME_CAPACITY);
  latest: LatestReading = { t: 0, f0: 0, conf: 0, rms: 0, active: false, uncertain: false };

  private snapshot: EngineSnapshot = IDLE;
  private listeners = new Set<() => void>();
  private result: EngineResult | null = null;

  private config: TrackerConfig = DEFAULT_TRACKER_CONFIG;
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly buf = new Float32Array(FFT_SIZE);
  private readonly tracker = new PitchTracker(FFT_SIZE);
  private readonly vad = new ActivityDetector();

  private accMs = 0;
  private runStart = 0;
  private startToken = 0;
  private detach: (() => void)[] = [];

  // ---- external-store plumbing for React ----
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = (): EngineSnapshot => this.snapshot;
  private set(patch: Partial<EngineSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((l) => l());
  }

  get status(): EngineStatus {
    return this.snapshot.status;
  }
  get sampleRate(): number {
    return this.ctx?.sampleRate ?? 0;
  }
  getResult(): EngineResult | null {
    return this.result;
  }

  /** Live-tweak detection parameters without restarting. */
  setConfig(config: TrackerConfig): void {
    this.config = config;
  }

  /** Seconds of captured (non-paused) time. */
  elapsedSec(): number {
    const live = this.snapshot.status === 'running' ? performance.now() - this.runStart : 0;
    return (this.accMs + live) / 1000;
  }

  // ---- lifecycle ----
  async start(opts: StartOptions): Promise<void> {
    if (this.snapshot.status === 'requesting' || this.snapshot.status === 'running' || this.snapshot.status === 'paused') return;
    const support = audioSupported();
    if (!support.ok) {
      this.set({ ...IDLE, status: 'error', error: support.reason ?? 'Audio capture is not supported.' });
      return;
    }

    this.release();
    this.result = null;
    this.config = opts.config;
    const token = ++this.startToken;
    this.set({ ...IDLE, status: 'requesting' });

    let notice: string | null = null;
    let stream: MediaStream;
    const audio = (deviceId?: string): MediaStreamConstraints => ({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        // Voice processing distorts pitch and loudness; analysis wants the raw signal.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    });
    try {
      try {
        stream = await navigator.mediaDevices.getUserMedia(audio(opts.deviceId));
      } catch (err) {
        if (opts.deviceId && err instanceof DOMException && err.name === 'OverconstrainedError') {
          notice = 'Your selected microphone was not found, so the default input is being used.';
          stream = await navigator.mediaDevices.getUserMedia(audio());
        } else {
          throw err;
        }
      }
    } catch (err) {
      if (token === this.startToken) this.set({ ...IDLE, status: 'error', error: describeMicError(err) });
      return;
    }

    if (token !== this.startToken) {
      // Stopped/unmounted while the permission prompt was open.
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    try {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      if (ctx.state === 'suspended') await ctx.resume();
      if (token !== this.startToken) {
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close();
        return;
      }
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser); // deliberately not connected to the speakers (no feedback)

      this.stream = stream;
      this.ctx = ctx;
      this.source = source;
      this.analyser = analyser;

      if (opts.record && typeof MediaRecorder !== 'undefined') {
        const type = RECORDER_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
        try {
          const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
          this.chunks = [];
          rec.ondataavailable = (e) => e.data.size > 0 && this.chunks.push(e.data);
          rec.start(1000);
          this.recorder = rec;
        } catch {
          notice = 'Audio recording is not available in this browser; pitch analysis continues without replay.';
        }
      } else if (opts.record) {
        notice = 'Audio recording is not available in this browser; pitch analysis continues without replay.';
      }

      this.attachListeners(stream, ctx);
      this.log.clear();
      this.tracker.reset();
      this.vad.reset();
      this.latest = { t: 0, f0: 0, conf: 0, rms: 0, active: false, uncertain: false };
      this.accMs = 0;
      this.runStart = performance.now();
      this.timer = setInterval(this.tick, ANALYSIS_INTERVAL_MS);
      this.set({ status: 'running', notice });
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      this.release();
      if (token === this.startToken) this.set({ ...IDLE, status: 'error', error: describeMicError(err) });
    }
  }

  pause(): void {
    if (this.snapshot.status !== 'running') return;
    this.accMs += performance.now() - this.runStart;
    this.clearTimer();
    // Disabling the track turns the browser's "recording" indicator off while paused.
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = false));
    if (this.recorder?.state === 'recording') this.recorder.pause();
    this.tracker.reset();
    this.vad.reset();
    this.latest = { ...this.latest, f0: 0, active: false, rms: 0 };
    this.set({ status: 'paused' });
  }

  async resume(): Promise<void> {
    if (this.snapshot.status !== 'paused' || !this.ctx) return;
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = true));
    try {
      if (this.ctx.state !== 'running') await this.ctx.resume();
    } catch {
      /* surfaced by the statechange handler */
    }
    if (this.recorder?.state === 'paused') this.recorder.resume();
    this.runStart = performance.now();
    this.timer = setInterval(this.tick, ANALYSIS_INTERVAL_MS);
    this.set({ status: 'running' });
  }

  /** Try to resume an interrupted audio context. Must be called from a user gesture on some browsers. */
  async recoverContext(): Promise<void> {
    if (!this.ctx) return;
    try {
      await this.ctx.resume();
      this.set({ interrupted: this.ctx.state !== 'running' });
    } catch {
      this.set({ interrupted: true });
    }
  }

  async stop(reason: StopReason = 'user'): Promise<EngineResult | null> {
    this.startToken++; // cancels a start that is still waiting on the permission prompt
    const st = this.snapshot.status;
    if (st === 'requesting') {
      this.set({ ...IDLE });
      return null;
    }
    if (st !== 'running' && st !== 'paused') return this.result;

    if (st === 'running') this.accMs += performance.now() - this.runStart;
    this.clearTimer();
    const durationSec = this.accMs / 1000;
    const audio = await this.finishRecorder();
    this.release();
    this.result = { durationSec, audio };
    this.set({ status: 'stopped', stopReason: reason, interrupted: false });
    return this.result;
  }

  /** Release everything (component unmount). Safe to call at any time and more than once. */
  dispose(): void {
    this.startToken++;
    this.clearTimer();
    this.release();
    this.listeners.clear();
  }

  // ---- internals ----
  private tick = (): void => {
    const analyser = this.analyser;
    if (!analyser || this.snapshot.status !== 'running') return;
    const buf = this.buf;
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);

    const t = this.elapsedSec();
    const active = this.vad.process(rms);
    const r = this.tracker.process(buf, this.sampleRate, rms, this.config);
    const uncertain = r.voiced && r.confidence < CONFIDENT_AT;
    const flags = (active ? FLAG_ACTIVE : 0) | (uncertain ? FLAG_UNCERTAIN : 0);
    this.latest = { t, f0: r.voiced ? r.f0 : 0, conf: r.confidence, rms, active, uncertain };
    if (!this.log.push(t, this.latest.f0, r.confidence, rms, flags) || t >= MAX_SESSION_SEC) {
      this.set({ notice: `Maximum session length (${MAX_SESSION_SEC / 60} min) reached; the session was stopped.` });
      void this.stop('max-length');
    }
  };

  private attachListeners(stream: MediaStream, ctx: AudioContext): void {
    for (const track of stream.getAudioTracks()) {
      const onEnded = () => {
        if (this.snapshot.status === 'running' || this.snapshot.status === 'paused') {
          this.set({ notice: 'The microphone was disconnected, so the session ended. What was captured so far is kept.' });
          void this.stop('device-lost');
        }
      };
      track.addEventListener('ended', onEnded);
      this.detach.push(() => track.removeEventListener('ended', onEnded));
    }

    const onState = () => {
      const bad = ctx.state !== 'running' && this.snapshot.status === 'running';
      this.set({ interrupted: bad });
      // Chrome auto-suspends contexts occasionally; try once without a gesture.
      if (bad && ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    };
    ctx.addEventListener('statechange', onState);
    this.detach.push(() => ctx.removeEventListener('statechange', onState));

    const onVisible = () => {
      if (document.visibilityState === 'visible' && this.snapshot.status === 'running' && ctx.state !== 'running') {
        void ctx.resume().catch(() => undefined);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    this.detach.push(() => document.removeEventListener('visibilitychange', onVisible));
  }

  private clearTimer(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private finishRecorder(): Promise<Blob | null> {
    const rec = this.recorder;
    if (!rec) return Promise.resolve(null);
    return new Promise((resolve) => {
      const done = () => {
        const type = rec.mimeType || 'audio/webm';
        resolve(this.chunks.length ? new Blob(this.chunks, { type }) : null);
      };
      if (rec.state === 'inactive') return done();
      rec.addEventListener('stop', done, { once: true });
      try {
        rec.stop();
      } catch {
        done();
      }
    });
  }

  private release(): void {
    this.detach.forEach((d) => d());
    this.detach = [];
    this.recorder = null;
    this.chunks = [];
    try {
      this.source?.disconnect();
    } catch {
      /* already disconnected */
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.ctx && this.ctx.state !== 'closed') void this.ctx.close().catch(() => undefined);
    this.source = null;
    this.analyser = null;
    this.stream = null;
    this.ctx = null;
  }
}
