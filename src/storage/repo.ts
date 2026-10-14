// Session persistence. The list view only loads light metadata; the (larger) pitch contour
// and the audio blob live in separate stores and are loaded on demand.

import type { Contour } from '../audio/frameLog';
import { computeMetrics, METRICS_VERSION } from '../sessions/metrics';
import type { SessionMeta, SessionRecord } from '../sessions/types';
import { IndexedDbBackend, MemoryBackend, STORE_NAMES, type KVBackend } from './backend';

export class SessionRepo {
  constructor(private readonly backend: KVBackend) {}

  get persistent(): boolean {
    return this.backend.persistent;
  }

  async save(record: SessionRecord, audio?: Blob | null): Promise<void> {
    const { contour, ...meta } = record;
    const stored: SessionMeta = { ...meta, hasAudio: !!audio };
    // Heavy data first: a half-finished save leaves an orphan blob, never a record pointing at nothing.
    if (audio) await this.backend.put('audio', record.id, audio);
    await this.backend.put('contours', record.id, contour);
    await this.backend.put('sessions', record.id, stored);
  }

  /** Newest first. */
  async list(): Promise<SessionMeta[]> {
    const all = await this.backend.getAll<unknown>('sessions');
    return all
      .map(normalizeMeta)
      .filter((m): m is SessionMeta => m !== null)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async get(id: string): Promise<SessionRecord | undefined> {
    const meta = normalizeMeta(await this.backend.get<unknown>('sessions', id));
    const contour = await this.backend.get<Contour>('contours', id);
    if (!meta || !contour) return undefined;
    if (meta.metrics.version !== METRICS_VERSION) {
      // Metric definitions changed since this was saved: recompute so comparisons stay consistent.
      meta.metrics = computeMetrics(contour, {
        durationSec: meta.durationSec,
        transcript: meta.transcript,
        fillerList: meta.fillerList,
        passageWordCount: meta.passageWordCount,
      });
      await this.backend.put('sessions', id, meta);
    }
    return { ...meta, contour };
  }

  async getAudio(id: string): Promise<Blob | undefined> {
    return this.backend.get<Blob>('audio', id);
  }

  async remove(id: string): Promise<void> {
    await this.backend.delete('sessions', id);
    await this.backend.delete('contours', id);
    await this.backend.delete('audio', id);
  }

  async clearAll(): Promise<void> {
    for (const s of STORE_NAMES) await this.backend.clear(s);
  }
}

/** Validate/upgrade a stored record. Returns null for anything unusable. */
export function normalizeMeta(raw: unknown): SessionMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<SessionMeta>;
  if (typeof r.id !== 'string' || typeof r.createdAt !== 'number' || !r.metrics || typeof r.metrics !== 'object') return null;
  return {
    ...(r as SessionMeta),
    schemaVersion: 1,
    label: typeof r.label === 'string' ? r.label : 'Untitled session',
    mode: r.mode ?? 'free',
    durationSec: typeof r.durationSec === 'number' ? r.durationSec : r.metrics.durationSec ?? 0,
    hasAudio: !!r.hasAudio,
    fillerList: Array.isArray(r.fillerList) ? r.fillerList : [],
    transcript: Array.isArray(r.transcript) ? r.transcript : null,
  };
}

let shared: Promise<SessionRepo> | null = null;

/** App-wide repo: IndexedDB when available, otherwise an in-memory fallback (check `.persistent`). */
export function getRepo(): Promise<SessionRepo> {
  shared ??= IndexedDbBackend.open()
    .then((b) => new SessionRepo(b))
    .catch(() => new SessionRepo(new MemoryBackend()));
  return shared;
}
