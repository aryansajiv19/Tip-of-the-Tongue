import { profileTermList, type Profile } from '../guess/profile.js';

// Deepgram allows 100 keyterms and 500 tokens per request, and rejects the whole connection when
// over; so do web servers when the URL is too long (the terms are in the query string). Tokens are
// estimated high (one per 3 ASCII characters, one per other character, plus one per term) and we
// stop well short of 500. Non-ASCII text also takes up to 12 characters of URL per character.
const MAX_TERMS = 100;
const TOKEN_BUDGET = 400;
const MAX_URL_CHARS = 6000;
const MAX_TERM_CHARS = 40;
const tokensOf = (term: string): number => {
  const ascii = term.replace(/\P{ASCII}/gu, '').length;
  return Math.ceil(ascii / 3) + ([...term].length - ascii) + 1;
};
// `keyterm=` plus the encoded term plus `&`.
const urlCharsOf = (term: string): number => encodeURIComponent(term).length + 9;

// Names and jargon in a short brief: capitalised words and runs of them ("Henley Health"),
// acronyms, and anything with a digit ("SOC 2", "Q3"). A word capitalised only because it starts
// a sentence is skipped, unless the next word is capitalised too.
export function termsFromText(text: string): string[] {
  const tokens = [...text.matchAll(/[A-Za-z][A-Za-z0-9-]*|\d+/g)].map((m) => ({
    word: m[0],
    start: m.index,
    end: m.index + m[0].length,
  }));
  const isCapital = (w: string) => /^[A-Z]|^\d+$/.test(w);
  const standsOut = (w: string) => /\d/.test(w) || /^[A-Z]{2,}/.test(w) || /[A-Z].*[A-Z]/.test(w);
  const joined = (i: number) => {
    const next = tokens[i + 1];
    return next !== undefined && /^ $/.test(text.slice(tokens[i]?.end ?? 0, next.start));
  };

  const found: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length > 0) found.push(run.join(' '));
    run = [];
  };
  tokens.forEach((t, i) => {
    const sentenceStart =
      i === 0 || /[.!?\n]\s*$/.test(text.slice(tokens[i - 1]?.end ?? 0, t.start));
    const next = tokens[i + 1];
    const qualifies =
      standsOut(t.word) ||
      (isCapital(t.word) &&
        (!sentenceStart || (joined(i) && next !== undefined && isCapital(next.word))));
    if (!qualifies) return flush();
    // A gap longer than one space (a comma, a full stop) ends the run.
    if (run.length > 0 && !/^ $/.test(text.slice(tokens[i - 1]?.end ?? 0, t.start))) flush();
    run.push(t.word);
  });
  flush();
  return found;
}

// The terms to give the speech recogniser: the user's own words first, then the glossary of a
// long brief, or the names and jargon of a short one.
export function selectKeyterms(input: {
  profile?: Profile;
  brief?: string;
  glossary?: string;
}): string[] {
  const candidates = [
    ...(input.profile ? profileTermList(input.profile) : []),
    ...(input.glossary
      ? input.glossary.split(',')
      : input.brief
        ? termsFromText(input.brief.slice(0, 3000))
        : []),
  ];
  const seen = new Set<string>();
  const terms: string[] = [];
  let tokens = 0;
  let urlChars = 0;
  for (const raw of candidates) {
    const term = raw.trim();
    const key = term.toLowerCase();
    if (!term || term.length > MAX_TERM_CHARS || seen.has(key)) continue;
    if (
      terms.length >= MAX_TERMS ||
      tokens + tokensOf(term) > TOKEN_BUDGET ||
      urlChars + urlCharsOf(term) > MAX_URL_CHARS
    )
      break;
    seen.add(key);
    tokens += tokensOf(term);
    urlChars += urlCharsOf(term);
    terms.push(term);
  }
  return terms;
}
