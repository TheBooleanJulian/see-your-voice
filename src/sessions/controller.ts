// Ties the microphone engine to optional transcription, and exposes one snapshot for the UI.

import { MicEngine, type EngineResult, type EngineSnapshot, type StartOptions } from '../audio/micEngine';
import {
  createWebSpeechProvider,
  type TranscriptSegment,
  type TranscriptionProvider,
} from '../speech/recognition';

export interface ControllerSnapshot extends EngineSnapshot {
  transcribing: boolean;
  transcriptionError: string | null;
  segments: TranscriptSegment[];
  interim: string;
}

export interface ControllerStartOptions extends StartOptions {
  transcribe: boolean;
  lang: string;
}

export class SessionController {
  readonly engine = new MicEngine();
  private snap: ControllerSnapshot = {
    ...this.engine.getSnapshot(),
    transcribing: false,
    transcriptionError: null,
    segments: [],
    interim: '',
  };
  private listeners = new Set<() => void>();
  private provider: TranscriptionProvider | null = null;
  private lang = 'en-US';
  private wantTranscribe = false;
  private lastStatus = this.engine.getSnapshot().status;
  private unsubscribe: () => void;

  constructor() {
    this.unsubscribe = this.engine.subscribe(this.onEngine);
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = (): ControllerSnapshot => this.snap;

  private emit(patch: Partial<ControllerSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((l) => l());
  }

  private onEngine = (): void => {
    const e = this.engine.getSnapshot();
    const prev = this.lastStatus;
    this.lastStatus = e.status;
    this.emit({ ...e });
    if (!this.wantTranscribe) return;
    if (e.status === 'running' && prev !== 'running') this.beginTranscription();
    else if (e.status !== 'running' && prev === 'running') this.endTranscription();
  };

  private beginTranscription(): void {
    const provider = createWebSpeechProvider();
    if (!provider) {
      this.emit({ transcriptionError: 'Speech recognition is not supported in this browser (try Chrome or Edge). Everything else still works.' });
      return;
    }
    this.provider = provider;
    this.emit({ transcribing: true, transcriptionError: null });
    provider.start({
      lang: this.lang,
      now: () => this.engine.elapsedSec(),
      onSegment: (seg) => this.emit({ segments: [...this.snap.segments, seg], interim: '' }),
      onInterim: (text) => this.emit({ interim: text }),
      onError: (message) => {
        this.emit({ transcribing: false, transcriptionError: message });
      },
    });
  }

  private endTranscription(): void {
    this.provider?.stop();
    this.provider = null;
    this.emit({ transcribing: false, interim: '' });
  }

  async start(opts: ControllerStartOptions): Promise<void> {
    this.wantTranscribe = opts.transcribe;
    this.lang = opts.lang;
    this.emit({ segments: [], interim: '', transcriptionError: null, transcribing: false });
    await this.engine.start(opts);
  }

  pause(): void {
    this.engine.pause();
  }
  resume(): Promise<void> {
    return this.engine.resume();
  }
  stop(): Promise<EngineResult | null> {
    return this.engine.stop('user');
  }

  /** Stop everything and drop listeners (component unmount). */
  dispose(): void {
    this.provider?.stop();
    this.provider = null;
    this.unsubscribe();
    this.listeners.clear();
    this.engine.dispose();
  }
}
