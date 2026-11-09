import type { Word } from '../events.js';

// Stuttering is not word-finding: a start repeated ("c- c- coffee"), a sound held ("ssso") or the
// same word said again while it is being pushed out is the speaker working on a word they already
// have. Offering it would finish their word for them. Whole-word repetition of small words ("the
// the", "to the, the") is NOT counted: typical speakers do that when they search for a word.

const WINDOW_MS = 20_000;
// Two of these in the window mean the pauses are blocks, not searches.
const EVENTS_FOR_MODE = 2;

const SMALL_WORDS = new Set([
  'a',
  'i',
  'an',
  'the',
  'to',
  'in',
  'it',
  'is',
  'of',
  'on',
  'at',
  'so',
  'we',
  'he',
  'me',
  'my',
  'be',
  'do',
  'go',
  'no',
  'up',
  'or',
  'if',
  'as',
  'by',
  'can',
  'and',
  'but',
  'for',
  'you',
  'she',
  'his',
  'her',
  'our',
  'was',
  'are',
  'not',
  'that',
  'this',
  'with',
  'have',
  'they',
  'what',
]);
// Said twice for emphasis, which is ordinary speech.
const EMPHASIS = new Set([
  'very',
  'really',
  'much',
  'just',
  'well',
  'okay',
  'right',
  'yeah',
  'sorry',
]);

const clean = (text: string): string =>
  text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[.…,;:!?]+$/u, '');

// "c-", "b-b-", "s-s-sorry": a hyphen after the first sound(s). "co-worker" is a real word.
const isFragment = (t: string): boolean => /^[a-z]{1,3}-+$/.test(t) || /^([a-z]{1,3})-\1/.test(t);
// A sound held on: "ssso", "mmmm".
const isProlonged = (t: string): boolean => /([a-z])\1{2,}/.test(t) && t.length >= 3;
// One letter that is not a word, as in "c coffee".
const isLoneSound = (t: string): boolean => /^[b-hj-z]$/.test(t);

export interface Disfluency {
  // How many repetitions or prolongations there were in the last 20 s.
  events: number;
  // The speech ends in the middle of one: the next word is the one they have begun.
  atEnd: boolean;
}

export function disfluency(words: readonly Word[], nowMs: number): Disfluency {
  const tokens = [...words]
    .sort((a, b) => a.startMs - b.startMs)
    .filter((w) => w.endMs >= nowMs - WINDOW_MS)
    .map((w) => clean(w.text))
    .filter(Boolean);
  let events = 0;
  let atEnd = false;
  tokens.forEach((t, i) => {
    const next = tokens[i + 1];
    const isLast = i === tokens.length - 1;
    const begun =
      isFragment(t) ||
      isProlonged(t) ||
      // "c coffee", "com computer": a short start repeated as the whole word
      (next !== undefined &&
        (isLoneSound(t) || (t.length <= 3 && !SMALL_WORDS.has(t))) &&
        next.length >= t.length + 2 &&
        next.startsWith(t));
    const repeated =
      next !== undefined && next === t && t.length >= 4 && !SMALL_WORDS.has(t) && !EMPHASIS.has(t);
    if (begun || repeated) events++;
    // Ending on a lone sound or a fragment, or on the second of a repeated word.
    if (isLast && (isFragment(t) || isProlonged(t) || isLoneSound(t))) atEnd = true;
    if (
      isLast &&
      i > 0 &&
      tokens[i - 1] === t &&
      t.length >= 4 &&
      !SMALL_WORDS.has(t) &&
      !EMPHASIS.has(t)
    )
      atEnd = true;
  });
  return { events, atEnd };
}

export const inStutterMode = (d: Disfluency): boolean => d.events >= EVENTS_FOR_MODE || d.atEnd;
