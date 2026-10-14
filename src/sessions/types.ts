import type { Contour } from '../audio/frameLog';
import type { TranscriptSegment } from '../speech/recognition';
import type { FillerSummary } from '../speech/fillers';
import type { Pause, PauseStats, Segment } from '../speech/vad';
import type { PitchSummary } from '../pitch/stats';

export type PracticeMode = 'free' | 'pitch' | 'cadence' | 'presentation' | 'custom';

export const MODE_LABELS: Record<PracticeMode, string> = {
  free: 'Free speak',
  pitch: 'Pitch variation',
  cadence: 'Pause & cadence',
  presentation: 'Presentation',
  custom: 'Custom passage',
};

export interface PaceSample {
  /** Window start, seconds. */
  t: number;
  wpm: number;
}

export interface RateMetrics {
  words: number;
  /** Words per minute of time spent speaking (pauses excluded). */
  wpmSpeaking: number | null;
  /** Words per minute over the whole session (pauses included). */
  wpmOverall: number | null;
  /** 'transcript' = recognised words; 'passage' = assumed the user read the whole passage. */
  source: 'transcript' | 'passage';
  paceSeries: PaceSample[];
}

export interface LoudnessMetrics {
  /** Std-dev of per-frame level in dB across speech frames. Relative and uncalibrated (not SPL). */
  variationDb: number;
}

export interface SessionMetrics {
  /** Definition version. Bumped when any metric's meaning changes, so old sessions get recomputed. */
  version: number;
  durationSec: number;
  /** Time spent in speaking segments. */
  speakingSec: number;
  /** Time with a reliable pitch estimate. */
  voicedSec: number;
  pitch: PitchSummary | null;
  segments: Segment[];
  pauses: Pause[];
  pauseStats: PauseStats;
  rate: RateMetrics | null;
  fillers: FillerSummary | null;
  loudness: LoudnessMetrics | null;
}

export interface SessionMeta {
  schemaVersion: 1;
  id: string;
  /** Epoch milliseconds. */
  createdAt: number;
  label: string;
  mode: PracticeMode;
  passageId?: string;
  passageTitle?: string;
  /** Pitch-variation intent, e.g. "Curious question". */
  intent?: string;
  durationSec: number;
  hasAudio: boolean;
  /** Filler list used when the metrics were computed (kept so recomputation is faithful). */
  fillerList: string[];
  /** Word count of the passage, if one was shown. */
  passageWordCount?: number;
  transcript: TranscriptSegment[] | null;
  metrics: SessionMetrics;
}

export interface SessionRecord extends SessionMeta {
  contour: Contour;
}
