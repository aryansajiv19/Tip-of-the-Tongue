import type { Word } from '../../../server/src/events';

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');

// Turn the browser's growing transcript string into timestamped words.
// Words already seen keep their original times, so during silence the last
// word's endMs stays old and the server can measure the pause. Only words
// beyond the previous length get `nowMs`. If the browser rewrites a word
// (e.g. a final result fixing "knead" to "need"), the new text keeps the
// time of the word it replaced, so a rewrite never resets the pause clock.
// Scripts written without spaces between words: a whole sentence would be one "word", too long for
// the server to accept and useless for timing.
const NO_SPACES =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
// The server refuses a word longer than this (and the whole event with it).
const MAX_WORD_CHARS = 100;

export const tokenize = (text: string): string[] =>
  text
    .split(/\s+/)
    .flatMap((t) =>
      NO_SPACES.test(t)
        ? Array.from(segmenter.segment(t), (seg) => (seg.isWordLike ? seg.segment : ''))
        : [t],
    )
    .filter((t) => norm(t) !== '')
    .map((t) => Array.from(t).slice(0, MAX_WORD_CHARS).join(''));

export function stampWords(prev: Word[], transcript: string, nowMs: number): Word[] {
  return tokenize(transcript).map((token, i) => {
    const old = prev[i];
    if (!old) return { text: token, startMs: nowMs, endMs: nowMs };
    if (norm(old.text) === norm(token)) return old;
    return { ...old, text: token };
  });
}

// The restart watchdog: true when recognition should be running but has been
// silent (no start/result/end event) for longer than `staleMs`.
export function isStale(listening: boolean, lastEventMs: number, nowMs: number, staleMs = 20_000) {
  return listening && nowMs - lastEventMs > staleMs;
}
