import type { Word } from '../events.js';

// "Chemist's" -> "chemist", "pharmacies" -> "pharmacy". Crude on purpose: both sides of every
// comparison go through it, so it only has to be consistent.
export function normalizeWord(raw: string): string {
  let w = raw
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/'s?$/, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
  if (w.length > 3) {
    if (w.endsWith('ies')) w = `${w.slice(0, -3)}y`;
    else if (/(sses|xes|ches|shes)$/.test(w)) w = w.slice(0, -2);
    else if (w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  }
  // British and American spelling are one word: organiser / organizer.
  if (w.length > 5) w = w.replace(/iz(?=e$|ed$|er$|es$|ing$|ation$)/, 'is');
  return w;
}

export function normalizePhrase(phrase: string): string[] {
  return phrase.split(/\s+/).map(normalizeWord).filter(Boolean);
}

// Index of the first word of the first run of `words` that spells out `phrase`, or -1.
export function findPhrase(words: readonly Word[], phrase: string): number {
  const target = normalizePhrase(phrase);
  if (target.length === 0) return -1;
  const spoken = words.map((w) => normalizeWord(w.text));
  for (let i = 0; i + target.length <= spoken.length; i++) {
    if (target.every((t, j) => spoken[i + j] === t)) return i;
  }
  return -1;
}
