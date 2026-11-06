import type { Candidate, Word } from '../events.js';
import type { GuessResult } from '../guess/types.js';
import { findPhrase, normalizePhrase } from './normalize.js';

const MAX_OFFERED = 3;

export interface GateContext {
  // Words the user has said since the stuck point.
  saidSinceStuck: Word[];
  nowMs: number;
  lastOfferAtMs?: number;
  // Words already offered, with the time of the offer. Keys are compared after normalizing.
  recentlyOffered: ReadonlyMap<string, number>;
}

export type GateDecision =
  { offer: true; candidates: Candidate[] } | { offer: false; reason: string };

export function decideOffer(
  result: GuessResult,
  ctx: GateContext,
  opts: { minConfidence: number; cooldownMs: number },
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

  const offeredAt = new Map<string, number>();
  for (const [word, at] of ctx.recentlyOffered) offeredAt.set(normalizePhrase(word).join(' '), at);

  const fresh = ranked.filter((c) => {
    if (findPhrase(ctx.saidSinceStuck, c.word) !== -1) return false;
    const at = offeredAt.get(normalizePhrase(c.word).join(' '));
    return at === undefined || ctx.nowMs - at >= opts.cooldownMs;
  });
  const best = fresh[0];
  if (!best) return { offer: false, reason: 'already-offered' };
  if (best.confidence < opts.minConfidence) return { offer: false, reason: 'low-confidence' };

  return { offer: true, candidates: fresh.slice(0, MAX_OFFERED) };
}
