// The start of a word as a cue: "waiting list" gives "w", "chemist" gives "ch". Letters that sound
// as one (sh, ch, th, ph, wh, qu) stay together. A word that starts with a digit or a symbol
// gives that one character.
const TOGETHER = /^(?:sh|ch|th|ph|wh|qu)/i;

export function firstSound(word: string): string {
  const w = word.trim();
  return TOGETHER.exec(w)?.[0] ?? Array.from(w)[0] ?? '';
}

// What the card shows in place of the word.
export const cue = (word: string): string => `${firstSound(word)}…`;
