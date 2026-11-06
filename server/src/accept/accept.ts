import type { Candidate, Word } from '../events.js';
import { findPhrase, normalizePhrase } from '../gate/normalize.js';

export type Acceptance =
  | { status: 'pending' }
  | { status: 'accepted'; word: string; afterMs: number }
  | { status: 'expired' };

// Looks for an offered word (or phrase) in what was spoken after the offer. Words that started
// at or before the offer don't count: the user may have said them while stuck.
export function checkAcceptance(
  offer: { candidates: Candidate[]; offeredAtMs: number },
  spoken: Word[],
  nowMs: number,
  windowMs: number,
): Acceptance {
  const after = spoken.filter((w) => w.startMs > offer.offeredAtMs);
  let best: { word: string; afterMs: number } | undefined;

  for (const { word } of offer.candidates) {
    const at = findPhrase(after, word);
    if (at === -1) continue;
    const last = after[at + normalizePhrase(word).length - 1];
    if (!last) continue;
    const afterMs = last.endMs - offer.offeredAtMs;
    if (afterMs <= windowMs && (!best || afterMs < best.afterMs)) best = { word, afterMs };
  }

  if (best) return { status: 'accepted', ...best };
  return nowMs - offer.offeredAtMs > windowMs ? { status: 'expired' } : { status: 'pending' };
}
