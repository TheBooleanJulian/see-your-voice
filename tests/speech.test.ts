import { describe, expect, it } from 'vitest';
import { ActivityDetector, buildSegments, pauseStats } from '../src/speech/vad';
import { DEFAULT_FILLERS, countWords, findFillers, summarizeFillers } from '../src/speech/fillers';

const frames = (spec: [number, number][], dt = 0.025) => {
  // spec: [durationSec, active(0|1)] runs -> parallel t[] / active[]
  const t: number[] = [];
  const a: number[] = [];
  let now = 0;
  for (const [dur, on] of spec) {
    for (let i = 0; i < Math.round(dur / dt); i++) {
      t.push(now);
      a.push(on);
      now += dt;
    }
  }
  return { t, a };
};

describe('voice activity segments', () => {
  it('builds speaking segments and the pauses between them', () => {
    const { t, a } = frames([[0.5, 0], [1, 1], [0.6, 0], [1, 1], [0.5, 0]]);
    const { segments, pauses } = buildSegments(t, a);
    expect(segments).toHaveLength(2);
    expect(segments[0].startSec).toBeCloseTo(0.5, 2);
    expect(segments[0].endSec).toBeCloseTo(1.5, 1);
    expect(pauses).toHaveLength(1);
    expect(pauses[0].durSec).toBeCloseTo(0.6, 1);
  });

  it('does not count leading or trailing silence as pauses', () => {
    const { t, a } = frames([[2, 0], [1, 1], [2, 0]]);
    expect(buildSegments(t, a).pauses).toHaveLength(0);
  });

  it('bridges short gaps (breaths, plosives) within a phrase', () => {
    const { t, a } = frames([[1, 1], [0.15, 0], [1, 1]]);
    const r = buildSegments(t, a);
    expect(r.segments).toHaveLength(1);
    expect(r.pauses).toHaveLength(0);
  });

  it('discards clicks shorter than the minimum segment length', () => {
    const { t, a } = frames([[1, 0], [0.05, 1], [1, 0]]);
    expect(buildSegments(t, a).segments).toHaveLength(0);
  });

  it('handles empty input and never treats a timestamp jump as speech', () => {
    expect(buildSegments([], [])).toEqual({ segments: [], pauses: [] });
    // Tab suspended for 10 s after an active frame: the segment must not stretch across the gap.
    const r = buildSegments([0, 0.025, 0.05, 10], [1, 1, 1, 0]);
    expect(r.segments[0].endSec).toBeLessThan(0.2);
  });

  it('summarises pauses', () => {
    const s = pauseStats([{ startSec: 1, durSec: 0.5 }, { startSec: 3, durSec: 1.5 }], 60);
    expect(s).toMatchObject({ count: 2, totalSec: 2, meanSec: 1, longestSec: 1.5, longCount: 1, perMinute: 2 });
    expect(pauseStats([], 0)).toMatchObject({ count: 0, perMinute: 0, meanSec: 0 });
  });
});

describe('ActivityDetector', () => {
  it('detects speech above an adaptive floor and returns to silence', () => {
    const d = new ActivityDetector();
    for (let i = 0; i < 40; i++) expect(d.process(0.002)).toBe(false);
    for (let i = 0; i < 10; i++) expect(d.process(0.1)).toBe(true);
    // A dip that stays above the hysteresis (off) threshold keeps the state active.
    expect(d.process(0.02)).toBe(true);
    for (let i = 0; i < 5; i++) d.process(0.002);
    expect(d.process(0.002)).toBe(false);
  });

  it('adapts to a noisy room rather than calling it speech', () => {
    const d = new ActivityDetector();
    let active = 0;
    for (let i = 0; i < 400; i++) if (d.process(0.012)) active++;
    expect(active).toBeLessThan(40); // settles to "not speech" once the floor has adapted
  });
});

describe('filler detection', () => {
  const fills = (text: string, list = DEFAULT_FILLERS) => findFillers(text, list).map((h) => h.phrase);

  it('always counts unambiguous disfluencies', () => {
    expect(fills('Um, I think uh we should er start')).toEqual(['um', 'uh', 'er']);
  });

  it('does not match inside other words', () => {
    expect(fills('The umbrella was ugly and the hamster was erratic')).toEqual([]);
  });

  it('does not count "like" as a verb, preposition, or comparison', () => {
    expect(fills('I like pizza')).toEqual([]);
    expect(fills('She looks like her mother')).toEqual([]);
    expect(fills('I would like to book a table')).toEqual([]);
    expect(fills('They do not like it')).toEqual([]);
    expect(fills('It feels like rain')).toEqual([]);
  });

  it('counts "like" used as a discourse filler', () => {
    expect(fills('It was, like, really good')).toEqual(['like']);
    expect(fills('and like we went there')).toEqual(['like']);
  });

  it('handles "you know" in questions vs as a filler', () => {
    expect(fills('Do you know the way to the station')).toEqual([]);
    expect(fills('Do you know how to fix it')).toEqual([]);
    expect(fills('It was a long day you know and I was tired')).toEqual(['you know']);
  });

  it('counts "actually" and "basically" but not "what actually happened"', () => {
    expect(fills('Basically we actually shipped it')).toEqual(['basically', 'actually']);
    expect(fills('Tell me what actually happened')).toEqual([]);
  });

  it('supports a custom list and multi-word phrases, longest first', () => {
    expect(fills('so yeah sort of right', ['sort of', 'sort', 'yeah'])).toEqual(['yeah', 'sort of']);
    expect(fills('you know you know', ['you know'])).toEqual(['you know', 'you know']);
  });

  it('is case-insensitive and ignores empty list entries', () => {
    expect(fills('UM okay Uh', ['  Um ', '', 'UH'])).toEqual(['um', 'uh']);
  });

  it('reports character offsets for highlighting', () => {
    const text = 'well um okay';
    const [h] = findFillers(text, ['um']);
    expect(text.slice(h.start, h.end)).toBe('um');
  });

  it('only reports a per-100-words rate when there is enough text', () => {
    const short = summarizeFillers('um hello there', DEFAULT_FILLERS);
    expect(short.total).toBe(1);
    expect(short.per100).toBeNull();
    const long = summarizeFillers(`${'word '.repeat(48)} um uh`, DEFAULT_FILLERS);
    expect(long.wordCount).toBe(50);
    expect(long.per100).toBeCloseTo(4, 10);
    expect(long.byPhrase).toEqual({ um: 1, uh: 1 });
  });

  it('handles empty text', () => {
    expect(summarizeFillers('', DEFAULT_FILLERS)).toMatchObject({ total: 0, wordCount: 0, per100: null });
    expect(countWords("it's a well-known fact")).toBe(5);
  });
});
