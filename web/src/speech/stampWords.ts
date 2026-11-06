import type { Word } from '../../../server/src/events';

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');

// Turn the browser's growing transcript string into timestamped words.
// Words already seen keep their original times, so during silence the last
// word's endMs stays old and the server can measure the pause. Only words
// beyond the previous length get `nowMs`. If the browser rewrites a word
// (e.g. a final result fixing "knead" to "need"), the new text keeps the
// time of the word it replaced, so a rewrite never resets the pause clock.
export const tokenize = (text: string): string[] => text.split(/\s+/).filter((t) => norm(t) !== '');

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
