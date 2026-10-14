import { describe, expect, it } from 'vitest';
import { FLAG_ACTIVE, FLAG_UNCERTAIN, FrameLog, type Contour } from '../src/audio/frameLog';
import { matchPauses } from '../src/practice/cadence';
import { parsePassage } from '../src/practice/passages';
import { suggest } from '../src/practice/suggestions';
import { buildSessionRecord } from '../src/sessions/build';
import { compareSessions, suggestComparison } from '../src/sessions/compare';
import { computeMetrics, METRICS_VERSION } from '../src/sessions/metrics';
import { DEFAULT_FILLERS } from '../src/speech/fillers';
import { MemoryBackend } from '../src/storage/backend';
import { DEFAULT_PREFS, loadPrefs, sanitizePrefs, savePrefs } from '../src/storage/prefs';
import { normalizeMeta, SessionRepo } from '../src/storage/repo';
import { cMidi } from '../src/visualization/keyboard';

const DT = 0.025;

/** Build a contour from [seconds, f0 (0 = unvoiced), active] runs. */
function contour(runs: [number, number, boolean?][]): Contour {
  const t: number[] = [];
  const f0: number[] = [];
  const conf: number[] = [];
  const rms: number[] = [];
  const flags: number[] = [];
  let now = 0;
  for (const [dur, hz, act] of runs) {
    const active = act ?? hz > 0;
    for (let i = 0; i < Math.round(dur / DT); i++) {
      t.push(now);
      f0.push(hz);
      conf.push(hz > 0 ? 0.95 : 0);
      rms.push(active ? 0.1 : 0.001);
      flags.push(active ? FLAG_ACTIVE : 0);
      now += DT;
    }
  }
  return { t, f0, conf, rms, flags };
}

const speech30 = 'one two three four five six seven eight nine ten '.repeat(3).trim(); // 30 words

describe('session metrics', () => {
  const c = contour([[1, 0], [3, 120], [1, 0], [3, 180], [1, 0]]); // 9 s, 2 segments, 2 pauses incl... see below

  it('aggregates duration, speaking time, pitch and pauses', () => {
    const m = computeMetrics(c, { fillerList: DEFAULT_FILLERS });
    expect(m.version).toBe(METRICS_VERSION);
    expect(m.durationSec).toBeCloseTo(9, 1);
    expect(m.segments).toHaveLength(2);
    expect(m.speakingSec).toBeCloseTo(6, 1);
    expect(m.voicedSec).toBeCloseTo(6, 1);
    expect(m.pauses).toHaveLength(1);
    expect(m.pauseStats.count).toBe(1);
    expect(m.pauseStats.longestSec).toBeCloseTo(1, 1);
    expect(m.pauseStats.longCount).toBe(1);
    expect(m.pitch!.minHz).toBe(120);
    expect(m.pitch!.maxHz).toBe(180);
    expect(m.pitch!.fullRangeSemitones).toBeCloseTo(12 * Math.log2(1.5), 5);
    expect(m.rate).toBeNull();
    expect(m.fillers).toBeNull();
  });

  it('handles a contour with no valid pitch and an empty contour', () => {
    const none = computeMetrics(contour([[3, 0, true]]), { fillerList: [] });
    expect(none.pitch).toBeNull();
    expect(none.voicedSec).toBe(0);
    const empty = computeMetrics({ t: [], f0: [], conf: [], rms: [], flags: [] }, { fillerList: [] });
    expect(empty.durationSec).toBe(0);
    expect(empty.pitch).toBeNull();
    expect(empty.segments).toEqual([]);
  });

  it('ignores NaN and negative pitch values', () => {
    const bad = contour([[2, 150]]);
    (bad.f0 as number[])[3] = NaN;
    (bad.f0 as number[])[4] = -20;
    const m = computeMetrics(bad, { fillerList: [] });
    expect(m.pitch!.minHz).toBe(150);
    expect(Number.isFinite(m.voicedSec)).toBe(true);
  });

  it('separates speaking rate from overall rate so long pauses do not look slow', () => {
    const long = contour([[10, 0], [10, 150]]); // 10 s silence then 10 s speech
    const m = computeMetrics(long, {
      fillerList: [],
      transcript: [{ t: 18, text: speech30, confidence: 0.9 }],
    });
    expect(m.rate!.source).toBe('transcript');
    expect(m.rate!.words).toBe(30);
    expect(m.rate!.wpmSpeaking).toBeCloseTo(180, 0); // 30 words / 10 s speaking
    expect(m.rate!.wpmOverall).toBeCloseTo(90, 0); // 30 words / 20 s total
  });

  it('estimates rate from a passage only when there is no transcript', () => {
    const m = computeMetrics(contour([[10, 150]]), { fillerList: [], passageWordCount: 25 });
    expect(m.rate!.source).toBe('passage');
    expect(m.rate!.wpmSpeaking).toBeCloseTo(150, 0);
  });

  it('refuses a rate for very little speech', () => {
    const m = computeMetrics(contour([[1, 150]]), { fillerList: [], passageWordCount: 20 });
    expect(m.rate!.wpmSpeaking).toBeNull();
  });

  it('counts fillers from the transcript only', () => {
    const m = computeMetrics(contour([[12, 150]]), {
      fillerList: DEFAULT_FILLERS,
      transcript: [{ t: 6, text: `um ${speech30}`, confidence: 0.9 }, { t: 11, text: 'uh I like pizza', confidence: 0.9 }],
    });
    expect(m.fillers!.total).toBe(2);
    expect(m.fillers!.byPhrase).toEqual({ um: 1, uh: 1 });
    expect(m.fillers!.per100).not.toBeNull();
  });

  it('reports no relative-level variation without enough speech frames', () => {
    expect(computeMetrics(contour([[0.1, 150]]), { fillerList: [] }).loudness).toBeNull();
    expect(computeMetrics(contour([[3, 150]]), { fillerList: [] }).loudness!.variationDb).toBe(0);
  });
});

describe('suggestions', () => {
  it('flags flat pitch with the evidence that triggered it', () => {
    const m = computeMetrics(contour([[12, 140]]), { fillerList: [] });
    const tips = suggest(m);
    expect(tips[0].drill).toBe('pitch');
    expect(tips[0].evidence).toMatch(/semitones/);
  });

  it('returns at most the requested number and never an empty list', () => {
    expect(suggest(computeMetrics(contour([[1, 0]]), { fillerList: [] }))).toHaveLength(1);
    const many = computeMetrics(contour([[30, 140]]), {
      fillerList: DEFAULT_FILLERS,
      transcript: [{ t: 29, text: 'um uh er '.repeat(20) + speech30.repeat(3), confidence: 1 }],
    });
    expect(suggest(many).length).toBeLessThanOrEqual(2);
  });
});

describe('frame log', () => {
  it('is bounded and reports when full', () => {
    const log = new FrameLog(3);
    expect(log.push(0, 100, 1, 0.1, 0)).toBe(true);
    expect(log.push(0.1, 100, 1, 0.1, 0)).toBe(true);
    expect(log.push(0.2, 100, 1, 0.1, 0)).toBe(true);
    expect(log.push(0.3, 100, 1, 0.1, 0)).toBe(false);
    expect(log.length).toBe(3);
  });

  it('copies out a contour and finds frames by time', () => {
    const log = new FrameLog(10);
    for (let i = 0; i < 5; i++) log.push(i * 0.5, 100 + i, 0.9, 0.1, i % 2 ? FLAG_ACTIVE | FLAG_UNCERTAIN : 0);
    const c = log.toContour();
    expect(c.t).toHaveLength(5);
    log.clear();
    expect(log.length).toBe(0);
    expect(c.f0[4]).toBe(104); // the copy is unaffected by clearing
    log.push(0, 1, 1, 1, 0);
    log.push(1, 1, 1, 1, 0);
    log.push(2, 1, 1, 1, 0);
    expect(log.lowerBound(0.5)).toBe(1);
    expect(log.lowerBound(5)).toBe(3);
    expect(log.lowerBound(-1)).toBe(0);
  });
});

describe('session storage', () => {
  const make = (over: Partial<Parameters<typeof buildSessionRecord>[0]> = {}) =>
    buildSessionRecord({
      contour: contour([[2, 0], [4, 150], [1, 0], [4, 190]]),
      durationSec: 11,
      hasAudio: false,
      transcript: null,
      fillerList: DEFAULT_FILLERS,
      mode: 'free',
      label: 'Test',
      ...over,
    });

  it('saves, lists newest-first, loads and deletes a session with its audio', async () => {
    const repo = new SessionRepo(new MemoryBackend());
    const a = make({ now: 1000, label: 'old' });
    const b = make({ now: 2000, label: 'new' });
    await repo.save(a);
    await repo.save(b, new Blob(['audio-bytes'], { type: 'audio/webm' }));

    const list = await repo.list();
    expect(list.map((s) => s.label)).toEqual(['new', 'old']);
    expect('contour' in list[0]).toBe(false); // list stays light

    const full = await repo.get(b.id);
    expect(full!.contour.t.length).toBe(b.contour.t.length);
    expect(full!.hasAudio).toBe(true);
    expect(await (await repo.getAudio(b.id))!.text()).toBe('audio-bytes');
    expect(await repo.getAudio(a.id)).toBeUndefined();

    await repo.remove(b.id);
    expect((await repo.list()).map((s) => s.label)).toEqual(['old']);
    expect(await repo.get(b.id)).toBeUndefined();
    expect(await repo.getAudio(b.id)).toBeUndefined();
  });

  it('clears everything', async () => {
    const repo = new SessionRepo(new MemoryBackend());
    await repo.save(make(), new Blob(['x']));
    await repo.save(make());
    await repo.clearAll();
    expect(await repo.list()).toEqual([]);
  });

  it('deleting a missing id is a no-op', async () => {
    const repo = new SessionRepo(new MemoryBackend());
    await expect(repo.remove('nope')).resolves.toBeUndefined();
  });

  it('recomputes metrics saved under an older definition version', async () => {
    const backend = new MemoryBackend();
    const repo = new SessionRepo(backend);
    const rec = make();
    await repo.save(rec);
    const stale = { ...(await backend.get<any>('sessions', rec.id)), metrics: { ...rec.metrics, version: 0, speakingSec: -1 } };
    await backend.put('sessions', rec.id, stale);
    const loaded = await repo.get(rec.id);
    expect(loaded!.metrics.version).toBe(METRICS_VERSION);
    expect(loaded!.metrics.speakingSec).toBeGreaterThan(0);
    // ...and the upgrade is written back.
    expect((await backend.get<any>('sessions', rec.id)).metrics.version).toBe(METRICS_VERSION);
  });

  it('skips corrupt records instead of failing the whole list', async () => {
    const backend = new MemoryBackend();
    const repo = new SessionRepo(backend);
    await repo.save(make({ label: 'good' }));
    await backend.put('sessions', 'junk1', 'not an object');
    await backend.put('sessions', 'junk2', { id: 5 });
    expect((await repo.list()).map((s) => s.label)).toEqual(['good']);
    expect(normalizeMeta(null)).toBeNull();
    expect(normalizeMeta({ id: 'a', createdAt: 1, metrics: {} })).toMatchObject({ label: 'Untitled session', mode: 'free', fillerList: [] });
  });
});

describe('session comparison', () => {
  const rec = (over: Partial<Parameters<typeof buildSessionRecord>[0]>, c = contour([[1, 0], [5, 150], [1, 0], [5, 200]])) =>
    buildSessionRecord({ contour: c, durationSec: 12, hasAudio: false, transcript: null, fillerList: [], mode: 'pitch', label: 'x', ...over });

  it('reports per-metric values and differences, null when a side is missing', () => {
    const a = rec({ label: 'a' }, contour([[8, 150]]));
    const b = rec({ label: 'b' }, contour([[1, 0], [5, 150], [1, 0], [5, 200]]));
    const rows = Object.fromEntries(compareSessions(a, b).map((r) => [r.key, r]));
    expect(rows.range.a).toBeCloseTo(0, 5);
    expect(rows.range.b).toBeGreaterThan(3);
    expect(rows.range.delta).toBeCloseTo(rows.range.b! - rows.range.a!, 10);
    expect(rows.longPauses.delta).toBe(1);
    expect(rows.wpm.a).toBeNull();
    expect(rows.wpm.delta).toBeNull();
    expect(rows.fillers.delta).toBeNull();
  });

  it('suggests the latest other attempt of the same passage, then same mode', () => {
    const t = rec({ now: 5000, passageId: 'p1' });
    const same = rec({ now: 3000, passageId: 'p1' });
    const newerOther = rec({ now: 4000, passageId: 'p2' });
    expect(suggestComparison(t, [t, newerOther, same])!.id).toBe(same.id);
    expect(suggestComparison(t, [t, newerOther])!.id).toBe(newerOther.id);
    expect(suggestComparison(t, [t])).toBeNull();
    expect(suggestComparison(t, [t, rec({ now: 1, mode: 'cadence' })])).toBeNull();
  });
});

describe('passages and cadence matching', () => {
  it('parses pause markers into fractions of the passage', () => {
    const p = parsePassage('one two | three four | five six seven eight');
    expect(p.wordCount).toBe(8);
    expect(p.text).toBe('one two three four five six seven eight');
    expect(p.pauseFractions).toEqual([0.25, 0.5]);
    expect(parsePassage('no markers here').pauseFractions).toEqual([]);
    expect(parsePassage('| leading and trailing |').pauseFractions).toEqual([]);
  });

  it('matches actual pauses to suggested boundaries by position in the speech', () => {
    // 3 speaking segments of 2 s each; pauses fall at ~1/3 and ~2/3 of speaking time.
    const segments = [{ startSec: 0, endSec: 2 }, { startSec: 3, endSec: 5 }, { startSec: 6, endSec: 8 }];
    const pauses = [{ startSec: 2, durSec: 1 }, { startSec: 5, durSec: 1 }];
    const r = matchPauses([1 / 3, 2 / 3], pauses, segments);
    expect(r).toMatchObject({ suggested: 2, matched: 2, extra: 0 });
    const off = matchPauses([0.1, 0.9], pauses, segments);
    expect(off.matched).toBe(0);
    expect(off.extra).toBe(2);
    expect(matchPauses([0.5], [], []).matched).toBe(0);
  });

  it('does not let one pause satisfy two boundaries', () => {
    const segments = [{ startSec: 0, endSec: 5 }, { startSec: 6, endSec: 10 }];
    const r = matchPauses([0.5, 0.52], [{ startSec: 5, durSec: 1 }], segments);
    expect(r.matched).toBe(1);
  });
});

describe('keyboard axis helpers', () => {
  it('maps octave numbers to the MIDI number of that C', () => {
    expect(cMidi(4)).toBe(60);
    expect(cMidi(2)).toBe(36);
    expect(cMidi(5) - cMidi(4)).toBe(12);
  });
});

describe('preferences', () => {
  it('clamps and repairs corrupted values', () => {
    const p = sanitizePrefs({ lowOctave: 99, octaves: -4, a4: 'x', graphWindowSec: 7, minHz: 5, maxHz: 10, fillers: ['Um ', '', 3], lang: 'not a lang!' });
    expect(p.lowOctave).toBe(4);
    expect(p.octaves).toBe(2);
    expect(p.a4).toBe(440);
    expect(p.graphWindowSec).toBe(15);
    expect(p.minHz).toBe(40);
    expect(p.maxHz).toBeGreaterThan(p.minHz);
    expect(p.fillers).toEqual(['um']);
    expect(p.lang).toBe('en-US');
  });

  it('falls back to defaults for junk and missing storage', () => {
    expect(sanitizePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(sanitizePrefs('garbage')).toEqual(DEFAULT_PREFS);
    expect(loadPrefs(null)).toEqual(DEFAULT_PREFS);
    expect(loadPrefs({ getItem: () => '{not json' })).toEqual(DEFAULT_PREFS);
    expect(() => savePrefs(DEFAULT_PREFS, { setItem: () => { throw new Error('quota'); } })).not.toThrow();
  });

  it('round-trips through storage', () => {
    const store = new Map<string, string>();
    const api = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    savePrefs({ ...DEFAULT_PREFS, octaves: 4, graphScale: 'hz' }, api);
    expect(loadPrefs(api)).toMatchObject({ octaves: 4, graphScale: 'hz' });
  });
});
