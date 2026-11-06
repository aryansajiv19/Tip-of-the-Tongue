import type { Word } from '../../server/src/events.js';
import { normalizeWord } from '../../server/src/gate/normalize.js';

const FILLER_SOUNDS = new Set(['um', 'umm', 'uh', 'uhh', 'er', 'erm', 'hmm']);

// Plausible mishearings: homophones and near-sounds a speech recogniser produces.
const MISHEARD: Readonly<Record<string, string>> = {
  to: 'two',
  for: 'four',
  their: 'there',
  there: 'their',
  its: "it's",
  your: "you're",
  where: 'wear',
  which: 'witch',
  here: 'hear',
  hear: 'here',
  no: 'know',
  know: 'no',
  right: 'write',
  would: 'wood',
  one: 'won',
  by: 'buy',
  see: 'sea',
  red: 'read',
  week: 'weak',
  whole: 'hole',
  thing: 'think',
  the: 'a',
  a: 'the',
  and: 'an',
  of: 'off',
  in: 'an',
  at: 'it',
  was: 'what',
  place: 'plays',
  sharp: 'shark',
  yellow: 'hello',
  long: 'lung',
  watch: 'wash',
  bread: 'red',
  teeth: 'teach',
  plane: 'plain',
  light: 'life',
  round: 'wound',
  green: 'grin',
  fruit: 'fruit',
  head: 'had',
  hold: 'old',
  wear: 'where',
  look: 'luck',
  time: 'thyme',
  bill: 'build',
  list: 'lift',
  door: 'doer',
  cold: 'called',
  hand: 'and',
  name: 'main',
  person: 'parson',
  phone: 'foam',
  wire: 'wine',
  box: 'books',
  shop: 'chop',
  money: 'mummy',
  man: 'men',
  rain: 'train',
  kind: 'find',
};

// Chance that a word with an entry in the table is swapped. Tuned only so that about 10% of all
// non-target words end up swapped; see the realised rate in the report.
const SWAP_CHANCE = 0.35;

// Small deterministic generator (mulberry32), so a seed always gives the same noise.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(seed: number, id: string): number {
  let h = seed;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

export interface NoiseResult {
  words: Word[];
  swapped: number;
  // Words that could have been swapped: everything except fillers and protected words.
  eligible: number;
}

// What Chrome's Web Speech delivers: no um/uh, lowercase, no punctuation, and some mishearings.
// Timing is kept as it was, so pauses survive. Words in `protectedWords` (the target and its
// acceptable forms) are never changed or dropped.
export function degradeWords(words: Word[], protectedWords: string[], seed: number): NoiseResult {
  const protect = new Set(protectedWords.flatMap((p) => p.split(/\s+/)).map(normalizeWord));
  const next = rng(seed);
  const out: Word[] = [];
  let swapped = 0;
  let eligible = 0;

  for (const w of words) {
    const isProtected = protect.has(normalizeWord(w.text));
    const plain = w.text.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
    if (!isProtected && FILLER_SOUNDS.has(plain)) continue;
    if (plain === '') continue;
    if (isProtected) {
      out.push({ ...w, text: plain });
      continue;
    }
    eligible++;
    const heard = MISHEARD[plain];
    if (heard !== undefined && next() < SWAP_CHANCE) {
      swapped++;
      out.push({ ...w, text: heard });
    } else {
      out.push({ ...w, text: plain });
    }
  }
  return { words: out, swapped, eligible };
}
