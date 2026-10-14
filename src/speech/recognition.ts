// Speech-to-text behind a provider interface, so the rest of the app never depends on a
// specific engine. The only provider today is the browser's Web Speech API.
//
// PRIVACY: in Chrome/Edge the Web Speech API streams microphone audio to the browser
// vendor's cloud service. That is why transcription is strictly opt-in per session and the
// UI says so. Pitch analysis and everything else stay local either way.

export interface TranscriptSegment {
  /** Session time (seconds) at which this final result arrived. */
  t: number;
  text: string;
  /** Engine confidence 0..1 for the segment; 0 when the engine gives none. */
  confidence: number;
}

export interface TranscriptionHandlers {
  lang: string;
  /** Current session time in seconds. */
  now: () => number;
  onSegment: (seg: TranscriptSegment) => void;
  onInterim: (text: string) => void;
  onError: (message: string) => void;
}

export interface TranscriptionProvider {
  readonly name: string;
  /** True if audio leaves the device while this provider is active. */
  readonly sendsAudioOffDevice: boolean;
  start(h: TranscriptionHandlers): void;
  stop(): void;
}

// Minimal structural types: the Web Speech API is not in TypeScript's DOM lib.
interface SRAlternative {
  transcript: string;
  confidence: number;
}
interface SRResult {
  isFinal: boolean;
  0: SRAlternative;
}
interface SREvent {
  resultIndex: number;
  results: ArrayLike<SRResult>;
}
interface SRErrorEvent {
  error: string;
}
interface SRInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type SRConstructor = new () => SRInstance;

function findConstructor(): SRConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SRConstructor; webkitSpeechRecognition?: SRConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function webSpeechSupported(): boolean {
  return findConstructor() !== null;
}

export function createWebSpeechProvider(): TranscriptionProvider | null {
  const Ctor = findConstructor();
  if (!Ctor) return null;
  let rec: SRInstance | null = null;
  let wanted = false;

  return {
    name: 'Browser speech recognition (Web Speech API)',
    sendsAudioOffDevice: true,
    start(h) {
      wanted = true;
      const launch = () => {
        const r = new Ctor();
        rec = r;
        r.continuous = true;
        r.interimResults = true;
        r.lang = h.lang;
        r.onresult = (e) => {
          let interim = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const res = e.results[i];
            if (res.isFinal) {
              const text = res[0].transcript.trim();
              if (text) h.onSegment({ t: h.now(), text, confidence: res[0].confidence ?? 0 });
            } else {
              interim += res[0].transcript;
            }
          }
          h.onInterim(interim);
        };
        r.onerror = (e) => {
          if (e.error === 'no-speech' || e.error === 'aborted') return; // routine, auto-restarts
          wanted = false;
          const msg =
            e.error === 'not-allowed' || e.error === 'service-not-allowed'
              ? 'Speech recognition was blocked by the browser.'
              : e.error === 'network'
                ? 'Speech recognition needs an internet connection (the browser sends audio to its speech service).'
                : `Speech recognition stopped: ${e.error}.`;
          h.onError(msg);
        };
        r.onend = () => {
          // Engines end the stream after silence; restart while the session is live.
          if (wanted && rec === r) {
            try {
              launch();
            } catch {
              wanted = false;
            }
          }
        };
        r.start();
      };
      try {
        launch();
      } catch (err) {
        wanted = false;
        h.onError(`Could not start speech recognition: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    stop() {
      wanted = false;
      const r = rec;
      rec = null;
      if (r) {
        r.onresult = r.onerror = r.onend = null;
        try {
          r.stop();
        } catch {
          /* already stopped */
        }
      }
    },
  };
}
