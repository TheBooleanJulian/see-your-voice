// Filler-word detection on a transcript.
//
// Unambiguous disfluencies ("um", "uh") always count. Words that are often legitimate
// ("like", "actually", "you know") count only when the surrounding words do not suggest a
// normal use (e.g. "I like pizza", "looks like rain", "do you know the way"). This is a
// heuristic on text without punctuation, so it will still miss some and misjudge some.

export const DEFAULT_FILLERS = ['um', 'uh', 'er', 'like', 'basically', 'you know', 'actually'];

export interface FillerHit {
  phrase: string;
  /** Character offsets into the transcript text. */
  start: number;
  end: number;
}

export interface FillerSummary {
  total: number;
  byPhrase: Record<string, number>;
  wordCount: number;
  /** Fillers per 100 words, or null when the transcript is too short to be meaningful. */
  per100: number | null;
  hits: FillerHit[];
}

/** Minimum transcript length before a per-100-words rate is reported. */
export const MIN_WORDS_FOR_RATE = 30;

interface ContextRule {
  /** Not a filler when the previous word is one of these. */
  notAfter?: ReadonlySet<string>;
  /** Not a filler when the next word is one of these. */
  notBefore?: ReadonlySet<string>;
}

const set = (s: string) => new Set(s.split(/\s+/).filter(Boolean));

const RULES: Record<string, ContextRule> = {
  like: {
    notAfter: set(
      `i you we they he she who would wouldn't do don't did didn't does doesn't will won't can could should
       might may looks look looked looking feel feels felt sound sounds sounded seem seems seemed taste tastes
       smell smells something anything nothing someone anyone much more most exactly just very quite things
       people what how to be been even`,
    ),
    notBefore: set(`to it that this those these them you me us him her the a an my your his their our`),
  },
  actually: { notAfter: set(`what how who why when where that which`) },
  'you know': {
    notAfter: set(`do did does don't didn't if as how what who that which when where why would could can will`),
    notBefore: set(`how what where who when why that if whether better`),
  },
};

interface Token {
  word: string;
  start: number;
  end: number;
}

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  const re = /[\p{L}\p{N}']+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ word: m[0].toLowerCase().replace(/^'+|'+$/g, ''), start: m.index, end: m.index + m[0].length });
  }
  return out;
}

export function countWords(text: string): number {
  return tokenize(text).length;
}

export function findFillers(text: string, list: string[]): FillerHit[] {
  const phrases = list
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .map((p) => ({ phrase: p, words: p.split(/\s+/) }))
    .sort((a, b) => b.words.length - a.words.length); // longest phrase wins
  const tokens = tokenize(text);
  const hits: FillerHit[] = [];

  for (let i = 0; i < tokens.length; ) {
    let matched = false;
    for (const { phrase, words } of phrases) {
      if (i + words.length > tokens.length) continue;
      if (!words.every((w, k) => tokens[i + k].word === w)) continue;
      const rule = RULES[phrase];
      const prev = i > 0 ? tokens[i - 1].word : '';
      const next = i + words.length < tokens.length ? tokens[i + words.length].word : '';
      const legit = rule && ((prev && rule.notAfter?.has(prev)) || (next && rule.notBefore?.has(next)));
      if (!legit) {
        hits.push({ phrase, start: tokens[i].start, end: tokens[i + words.length - 1].end });
      }
      i += words.length;
      matched = true;
      break;
    }
    if (!matched) i++;
  }
  return hits;
}

export function summarizeFillers(text: string, list: string[]): FillerSummary {
  const hits = findFillers(text, list);
  const byPhrase: Record<string, number> = {};
  for (const h of hits) byPhrase[h.phrase] = (byPhrase[h.phrase] ?? 0) + 1;
  const wordCount = countWords(text);
  return {
    total: hits.length,
    byPhrase,
    wordCount,
    per100: wordCount >= MIN_WORDS_FOR_RATE ? (hits.length / wordCount) * 100 : null,
    hits,
  };
}
