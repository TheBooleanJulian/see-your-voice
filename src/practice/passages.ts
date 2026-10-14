// Practice text. A "|" marks a suggested pause location (Pause & cadence mode).

export interface Passage {
  id: string;
  title: string;
  text: string;
}

export const EXAMPLE_PRESENTATION: Passage = {
  id: 'example-presentation',
  title: 'Example: product introduction',
  text:
    "Good morning, everyone. I'm Alex, and today I'd like to show you how Northwind Scheduler can give every team back about five hours a week. " +
    'Most teams lose time to double-bookings, missed reminders and long email threads. ' +
    'Northwind connects to the calendars you already use, spots clashes before they happen, and sends reminders automatically. ' +
    "Setup takes about ten minutes, and there's nothing to install. " +
    "So, what would your team do with five extra hours every week? Let's find out together.",
};

export const PITCH_PASSAGE: Passage = {
  id: 'pitch-variation',
  title: 'Scheduling tool blurb',
  text: 'Our new scheduling tool saves each team about five hours a week. It connects to your calendar, sorts out clashes, and sends reminders automatically.',
};

export const PITCH_INTENTS = [
  { id: 'neutral', label: 'Neutral explanation', hint: 'Explain it plainly, as if briefing a colleague.' },
  { id: 'curious', label: 'Curious question', hint: 'Say it as a genuine question, wondering whether it is true.' },
  { id: 'confident', label: 'Confident statement', hint: 'Deliver it as settled fact; let your voice land firmly at the end of each sentence.' },
  { id: 'benefit', label: 'Emphasise the key benefit', hint: 'Give extra weight to "five hours a week".' },
] as const;

export const CADENCE_PASSAGES: Passage[] = [
  {
    id: 'cadence-welcome',
    title: 'Welcome remarks',
    text:
      "Thank you all for coming this evening. | We have a full programme ahead, | but first | I want to share three quick updates. | " +
      'One, | our membership has grown by twenty percent. | Two, | the new workspace opens next month. | And three, | we finally have a date for the annual dinner.',
  },
  {
    id: 'cadence-explainer',
    title: 'Teaching explanation',
    text:
      'Photosynthesis is how plants make their own food. | They take in sunlight, | water from the soil, | and carbon dioxide from the air. | ' +
      'Using that light energy, | the plant turns those ingredients into sugar | and releases oxygen as a by-product. | That oxygen is the air we breathe.',
  },
];

export const ARTICULATION_DRILLS: Passage[] = [
  { id: 'art-1', title: 'Plosives', text: 'Peter Piper picked a peck of pickled peppers. Big black bugs bleed blue black blood.' },
  { id: 'art-2', title: 'Sibilants', text: 'She sells seashells by the seashore. Six slippery snails slid slowly seaward.' },
  { id: 'art-3', title: 'Liquids', text: 'Red lorry, yellow lorry. Round the rough and rugged rock the ragged rascal ran.' },
  { id: 'art-4', title: 'Business terms', text: 'Our quarterly statistics specifically emphasise strategic infrastructure and regulatory compliance.' },
];

export interface ParsedPassage {
  /** Passage with pause markers removed and whitespace tidied. */
  text: string;
  wordCount: number;
  /** Suggested pause locations as a fraction (0..1) of the passage's words spoken before each. */
  pauseFractions: number[];
}

export function parsePassage(raw: string): ParsedPassage {
  const parts = raw.split('|');
  const counts = parts.map((p) => p.split(/\s+/).filter(Boolean).length);
  const total = counts.reduce((a, b) => a + b, 0);
  const pauseFractions: number[] = [];
  let seen = 0;
  for (let i = 0; i < parts.length - 1; i++) {
    seen += counts[i];
    if (total > 0 && seen > 0 && seen < total) pauseFractions.push(seen / total);
  }
  return {
    text: parts.join(' ').replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim(),
    wordCount: total,
    pauseFractions,
  };
}
