import type { Language, Word } from '../events.js';
import { cuesFor, fold } from './languages.js';

// Saying "what's the word" (or "...for") at the end of what you just said asks for a suggestion
// now. Only the end counts, so "I forgot what's the word you used" in the middle does not. The
// phrases for the chosen language are checked ("cómo se dice" in Spanish).
export function endsWithAskForWord(words: readonly Word[], language: Language = 'en'): boolean {
  const spoken = fold(
    words
      .slice(-8)
      .flatMap((w) =>
        w.text
          .toLowerCase()
          .replace(/['’]/g, '')
          .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
          .split(/\s+/)
          .filter(Boolean),
      )
      .join(' '),
  );
  return cuesFor(language).asks.some((re) => re.test(spoken));
}
