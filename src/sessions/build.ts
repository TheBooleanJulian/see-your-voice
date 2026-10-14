import type { Contour } from '../audio/frameLog';
import type { TranscriptSegment } from '../speech/recognition';
import { computeMetrics } from './metrics';
import type { PracticeMode, SessionRecord } from './types';

export interface BuildInput {
  contour: Contour;
  durationSec: number;
  hasAudio: boolean;
  transcript: TranscriptSegment[] | null;
  fillerList: string[];
  mode: PracticeMode;
  label: string;
  passageId?: string;
  passageTitle?: string;
  passageWordCount?: number;
  intent?: string;
  now?: number;
}

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildSessionRecord(i: BuildInput): SessionRecord {
  return {
    schemaVersion: 1,
    id: newId(),
    createdAt: i.now ?? Date.now(),
    label: i.label,
    mode: i.mode,
    passageId: i.passageId,
    passageTitle: i.passageTitle,
    intent: i.intent,
    durationSec: i.durationSec,
    hasAudio: i.hasAudio,
    fillerList: i.fillerList,
    passageWordCount: i.passageWordCount,
    transcript: i.transcript && i.transcript.length ? i.transcript : null,
    metrics: computeMetrics(i.contour, {
      durationSec: i.durationSec,
      transcript: i.transcript,
      fillerList: i.fillerList,
      passageWordCount: i.passageWordCount,
    }),
    contour: i.contour,
  };
}
