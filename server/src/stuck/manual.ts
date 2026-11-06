import type { Word } from '../events.js';

// Saying "what's the word" (or "...for") at the end of what you just said asks for a suggestion
// now. Only the end counts, so "I forgot what's the word you used" in the middle does not.
export function endsWithAskForWord(words: readonly Word[]): boolean {
  const spoken = words
    .slice(-8)
    .flatMap((w) =>
      w.text
        .toLowerCase()
        .replace(/['’]/g, '')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter(Boolean),
    )
    .join(' ');
  return /\b(?:whats|what is) the word(?: for)?$/.test(spoken);
}
