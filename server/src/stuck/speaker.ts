import type { Word } from '../events.js';

// Who the user is, from the first thing said after they press Start: the voice that said most of
// those words. A single word is skipped, because speech-to-text often gets the first word of a
// new voice wrong, and it says too little. Undefined if no word carries a voice label.
export function speakerOfFirstUtterance(words: readonly Word[]): number | undefined {
  if (words.length < 2) return undefined;
  const counts = new Map<number, number>();
  for (const w of words) {
    if (w.speaker !== undefined) counts.set(w.speaker, (counts.get(w.speaker) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
}
