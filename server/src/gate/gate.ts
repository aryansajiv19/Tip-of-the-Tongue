import type { Candidate, Word } from '../events.js';
import type { GuessResult } from '../guess/types.js';
import { findPhrase, normalizePhrase } from './normalize.js';

const MAX_OFFERED = 3;

// Whether `small` appears inside `big` as a run of words.
function contains(big: readonly string[], small: readonly string[]): boolean {
  return small.length > 0 && big.some((_, i) => small.every((t, j) => big[i + j] === t));
}

export interface GateContext {
  // Words the user has said since the stuck point.
  saidSinceStuck: Word[];
  nowMs: number;
  lastOfferAtMs?: number;
  // Words already offered, with the time of the offer. Keys are compared after normalizing.
  recentlyOffered: ReadonlyMap<string, number>;
  // Words they said and took back: never offered.
  rejected?: string[];
}

export type GateDecision =
  { offer: true; candidates: Candidate[] } | { offer: false; reason: string };

export function decideOffer(
  result: GuessResult,
  ctx: GateContext,
  // `repeatMs`: how long a word that was offered stays off the list (default: the cooldown).
  opts: { minConfidence: number; cooldownMs: number; repeatMs?: number },
): GateDecision {
  const ranked = [...result.candidates].sort((a, b) => b.confidence - a.confidence);
  const top = ranked[0];
  if (result.abstain || !top) return { offer: false, reason: 'abstained' };

  if (findPhrase(ctx.saidSinceStuck, top.word) !== -1) {
    return { offer: false, reason: 'self-recovered' };
  }

  if (ctx.lastOfferAtMs !== undefined && ctx.nowMs - ctx.lastOfferAtMs < opts.cooldownMs) {
    return { offer: false, reason: 'cooldown' };
  }

  const offered = [...ctx.recentlyOffered].map(([word, at]) => ({
    tokens: normalizePhrase(word),
    at,
  }));

  const fresh = ranked.filter((c) => {
    if (findPhrase(ctx.saidSinceStuck, c.word) !== -1) return false;
    if (
      ctx.rejected?.some((r) => normalizePhrase(r).join(' ') === normalizePhrase(c.word).join(' '))
    )
      return false;
    const tokens = normalizePhrase(c.word);
    return offered.every((o) => {
      const age = ctx.nowMs - o.at;
      if (age >= (opts.repeatMs ?? opts.cooldownMs)) return true;
      // A longer form of an offered word is the same repeat ("onboarding team" after
      // "onboarding"). A shorter one soon after is the model correcting itself towards the exact
      // word ("SOC 2" after "SOC 2 report"), which the user should see; much later it is a repeat
      // again ("time-of-use" after a finished sentence, long after "time-of-use tariff").
      if (contains(tokens, o.tokens)) return false;
      return !(contains(o.tokens, tokens) && age >= opts.cooldownMs);
    });
  });
  const best = fresh[0];
  if (!best) return { offer: false, reason: 'already-offered' };
  if (best.confidence < opts.minConfidence) return { offer: false, reason: 'low-confidence' };

  // Weak extras are noise: after the top word, keep only those at half the threshold or better.
  const extras = fresh.slice(1).filter((c) => c.confidence >= opts.minConfidence / 2);
  return { offer: true, candidates: [best, ...extras].slice(0, MAX_OFFERED) };
}
