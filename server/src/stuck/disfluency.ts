import type { Word } from '../events.js';
import { cuesFor, type ActiveCues } from './languages.js';

// Stuttering is not word-finding: a start repeated ("c- c- coffee"), a sound held ("ssso") or the
// same word said again while it is being pushed out is the speaker working on a word they already
// have. Offering it would finish their word for them. Whole-word repetition of small words ("the
// the", "to the, the") is NOT counted: typical speakers do that when they search for a word.

const WINDOW_MS = 20_000;
// Two of these in the window mean the pauses are blocks, not searches.
const EVENTS_FOR_MODE = 2;

const clean = (text: string): string =>
  text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[.…,;:!?]+$/u, '');

// "c-", "b-b-", "s-s-sorry": a hyphen after the first sound(s). "co-worker" is a real word.
const isFragment = (t: string): boolean => /^\p{L}{1,3}-+$/u.test(t) || /^(\p{L}{1,3})-\1/u.test(t);
// A sound held on: "ssso", "mmmm".
const isProlonged = (t: string): boolean => /(\p{L})\1{2,}/u.test(t) && t.length >= 3;
// One letter that is not a word, as in "c coffee".
const isLoneSound = (t: string): boolean => /^[b-hj-z]$/.test(t);

export interface Disfluency {
  // How many repetitions or prolongations there were in the last 20 s.
  events: number;
  // The speech ends in the middle of one: the next word is the one they have begun.
  atEnd: boolean;
}

export function disfluency(
  words: readonly Word[],
  nowMs: number,
  cues: ActiveCues = cuesFor('en'),
): Disfluency {
  const { smallWords, emphasis } = cues;
  const loneSound = (t: string) => cues.loneLetterSounds && isLoneSound(t);
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
        (loneSound(t) || (t.length <= 3 && !smallWords.has(t))) &&
        next.length >= t.length + 2 &&
        next.startsWith(t));
    const repeated =
      next !== undefined && next === t && t.length >= 4 && !smallWords.has(t) && !emphasis.has(t);
    if (begun || repeated) events++;
    // Ending on a lone sound or a fragment, or on the second of a repeated word.
    if (isLast && (isFragment(t) || isProlonged(t) || loneSound(t))) atEnd = true;
    if (
      isLast &&
      i > 0 &&
      tokens[i - 1] === t &&
      t.length >= 4 &&
      !smallWords.has(t) &&
      !emphasis.has(t)
    )
      atEnd = true;
  });
  return { events, atEnd };
}

export const inStutterMode = (d: Disfluency): boolean => d.events >= EVENTS_FOR_MODE || d.atEnd;
