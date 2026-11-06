import type { Word } from '../../../server/src/events';

// Turn the browser's growing transcript string into timestamped words.
// Words already seen keep their original times, so during silence the last
// word's endMs stays old and the server can measure the pause. Only new words
// get `nowMs`. If the browser rewrites an earlier word, that word and
// everything after it is treated as new (keeps times in order).
export function stampWords(prev: Word[], transcript: string, nowMs: number): Word[] {
  const tokens = transcript.split(/\s+/).filter(Boolean);
  const out: Word[] = [];
  let reuse = true;
  tokens.forEach((token, i) => {
    const old = prev[i];
    reuse = reuse && old !== undefined && old.text.toLowerCase() === token.toLowerCase();
    out.push(reuse && old ? old : { text: token, startMs: nowMs, endMs: nowMs });
  });
  return out;
}
