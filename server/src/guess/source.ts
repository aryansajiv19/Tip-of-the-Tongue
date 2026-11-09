// Does `phrase` appear in `text` as a whole word or phrase, ignoring case? "Ames" is not found in
// "names", and "Q3 plan" matches "q3   plan".
export function appearsIn(text: string, phrase: string): boolean {
  const parts = phrase.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return false;
  const body = parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'iu').test(text);
}
