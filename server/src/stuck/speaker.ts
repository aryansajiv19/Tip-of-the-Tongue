import type { Word } from '../events.js';

// How much of the call is used to work out which voice is the user's.
export const IDENTIFY_WINDOW_MS = 20_000;

// The voice that said the most words in the first 20 seconds of labelled speech, or undefined
// while that stretch is not over yet (or nothing is labelled). A tie goes to the lower number.
export function loudestSpeaker(words: readonly Word[], nowMs: number): number | undefined {
  const labelled = words.filter((w) => w.speaker !== undefined);
  const first = labelled.reduce<number | undefined>(
    (min, w) => (min === undefined || w.startMs < min ? w.startMs : min),
    undefined,
  );
  if (first === undefined || nowMs - first < IDENTIFY_WINDOW_MS) return undefined;

  const counts = new Map<number, number>();
  for (const w of labelled) {
    if (w.startMs < first + IDENTIFY_WINDOW_MS && w.speaker !== undefined) {
      counts.set(w.speaker, (counts.get(w.speaker) ?? 0) + 1);
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
}
