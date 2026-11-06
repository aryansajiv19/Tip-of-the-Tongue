import { describe, expect, it } from 'vitest';
import type { Word } from '../events.js';
import type { GuessResult } from '../guess/types.js';
import { decideOffer, type GateContext } from './gate.js';

const opts = { minConfidence: 0.6, cooldownMs: 10_000 };
const said = (...texts: string[]): Word[] =>
  texts.map((text, i) => ({ text, startMs: i * 100, endMs: i * 100 + 90 }));
const guess = (...c: [string, number][]): GuessResult => ({
  candidates: c.map(([word, confidence]) => ({ word, confidence })),
  abstain: false,
  latencyMs: 100,
});
const ctx = (over: Partial<GateContext> = {}): GateContext => ({
  saidSinceStuck: [],
  nowMs: 100_000,
  recentlyOffered: new Map(),
  ...over,
});

describe('decideOffer', () => {
  it('offers when confident', () => {
    expect(decideOffer(guess(['pharmacy', 0.85], ['chemist', 0.5]), ctx(), opts)).toEqual({
      offer: true,
      candidates: [
        { word: 'pharmacy', confidence: 0.85 },
        { word: 'chemist', confidence: 0.5 },
      ],
    });
  });

  it('offers at exactly minConfidence, not just below it', () => {
    expect(decideOffer(guess(['a', 0.6]), ctx(), opts).offer).toBe(true);
    expect(decideOffer(guess(['a', 0.5999]), ctx(), opts)).toEqual({
      offer: false,
      reason: 'low-confidence',
    });
  });

  it('stays silent on abstain or no candidates', () => {
    expect(decideOffer({ candidates: [], abstain: true, latencyMs: 1 }, ctx(), opts)).toEqual({
      offer: false,
      reason: 'abstained',
    });
    expect(decideOffer(guess(), ctx(), opts)).toEqual({ offer: false, reason: 'abstained' });
    expect(decideOffer({ ...guess(['a', 0.9]), abstain: true }, ctx(), opts).offer).toBe(false);
  });

  it('limits to 3 candidates and sorts by confidence', () => {
    const r = decideOffer(guess(['a', 0.5], ['b', 0.9], ['c', 0.7], ['d', 0.6]), ctx(), opts);
    expect(r.offer && r.candidates.map((c) => c.word)).toEqual(['b', 'c', 'd']);
  });

  describe('weak extras', () => {
    it('keeps an extra at exactly half the threshold, drops one just below', () => {
      const r = decideOffer(guess(['a', 0.9], ['b', 0.3], ['c', 0.2999]), ctx(), opts);
      expect(r.offer && r.candidates.map((c) => c.word)).toEqual(['a', 'b']);
    });

    it('drops every weak extra and offers the top word alone', () => {
      const r = decideOffer(guess(['a', 0.6], ['b', 0.1], ['c', 0.05]), ctx(), opts);
      expect(r.offer && r.candidates.map((c) => c.word)).toEqual(['a']);
    });
  });

  describe('self-recovery', () => {
    it('no offer when the top word was said since the stuck point', () => {
      const r = decideOffer(
        guess(['pharmacy', 0.9]),
        ctx({ saidSinceStuck: said('the', 'pharmacy') }),
        opts,
      );
      expect(r).toEqual({ offer: false, reason: 'self-recovered' });
    });

    it('matches despite case, punctuation, possessive and plural', () => {
      for (const spoken of ['Chemist', 'chemist,', "chemist's", 'chemists']) {
        const r = decideOffer(guess(['chemist', 0.9]), ctx({ saidSinceStuck: said(spoken) }), opts);
        expect(r).toEqual({ offer: false, reason: 'self-recovered' });
      }
    });

    it('matches a spoken multi-word candidate', () => {
      const r = decideOffer(
        guess(['bread knife', 0.9]),
        ctx({ saidSinceStuck: said('a', 'bread', 'knife') }),
        opts,
      );
      expect(r).toEqual({ offer: false, reason: 'self-recovered' });
    });

    it('does not count half a multi-word candidate', () => {
      expect(
        decideOffer(guess(['bread knife', 0.9]), ctx({ saidSinceStuck: said('bread') }), opts)
          .offer,
      ).toBe(true);
    });

    it('drops a lower candidate that was said and keeps the rest', () => {
      const r = decideOffer(
        guess(['a', 0.9], ['b', 0.8], ['c', 0.7]),
        ctx({ saidSinceStuck: said('b') }),
        opts,
      );
      expect(r.offer && r.candidates.map((c) => c.word)).toEqual(['a', 'c']);
    });
  });

  describe('cooldown', () => {
    it('blocks within the global cooldown', () => {
      const r = decideOffer(
        guess(['a', 0.9]),
        ctx({ nowMs: 100_000, lastOfferAtMs: 95_000 }),
        opts,
      );
      expect(r).toEqual({ offer: false, reason: 'cooldown' });
    });

    it('allows at exactly the cooldown, blocks one ms before', () => {
      expect(decideOffer(guess(['a', 0.9]), ctx({ lastOfferAtMs: 90_000 }), opts).offer).toBe(true);
      expect(decideOffer(guess(['a', 0.9]), ctx({ lastOfferAtMs: 90_001 }), opts).offer).toBe(
        false,
      );
    });
  });

  describe('repeat offers', () => {
    it('does not re-offer the same word within the cooldown, whatever its spelling', () => {
      const recentlyOffered = new Map([["Pharmacy's", 95_000]]);
      const r = decideOffer(guess(['pharmacy', 0.9]), ctx({ recentlyOffered }), opts);
      expect(r).toEqual({ offer: false, reason: 'already-offered' });
    });

    it('re-offers once the cooldown has passed (boundary inclusive)', () => {
      const recentlyOffered = new Map([['pharmacy', 90_000]]);
      expect(decideOffer(guess(['pharmacy', 0.9]), ctx({ recentlyOffered }), opts).offer).toBe(
        true,
      );
    });

    it('drops only the repeated word', () => {
      const recentlyOffered = new Map([['a', 99_000]]);
      const r = decideOffer(guess(['a', 0.9], ['b', 0.8]), ctx({ recentlyOffered }), opts);
      expect(r.offer && r.candidates.map((c) => c.word)).toEqual(['b']);
    });

    it('stays silent if the best remaining word is under the threshold', () => {
      const recentlyOffered = new Map([['a', 99_000]]);
      const r = decideOffer(guess(['a', 0.9], ['b', 0.4]), ctx({ recentlyOffered }), opts);
      expect(r).toEqual({ offer: false, reason: 'low-confidence' });
    });
  });
});
