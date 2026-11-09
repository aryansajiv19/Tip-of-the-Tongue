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

  describe('repeat window', () => {
    const repeat = { ...opts, repeatMs: 180_000 };
    it('keeps an offered word off the list for the repeat window, then allows it', () => {
      const offered = (at: number) =>
        ctx({ nowMs: 300_000, recentlyOffered: new Map([['pharmacy', at]]) });
      expect(decideOffer(guess(['pharmacy', 0.9]), offered(121_000), repeat)).toEqual({
        offer: false,
        reason: 'already-offered',
      });
      expect(decideOffer(guess(['pharmacy', 0.9]), offered(120_000), repeat).offer).toBe(true);
    });
    it('falls back to the cooldown when no repeat window is given', () => {
      const old = ctx({ nowMs: 300_000, recentlyOffered: new Map([['pharmacy', 250_000]]) });
      expect(decideOffer(guess(['pharmacy', 0.9]), old, opts).offer).toBe(true);
    });
    it('does not change the global cooldown', () => {
      const r = decideOffer(guess(['b', 0.9]), ctx({ lastOfferAtMs: 95_000 }), repeat);
      expect(r).toEqual({ offer: false, reason: 'cooldown' });
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

    it('also blocks a longer form of an offered word: "onboarding team" after "onboarding"', () => {
      const recentlyOffered = new Map([['onboarding', 99_000]]);
      const r = decideOffer(guess(['onboarding team', 0.6]), ctx({ recentlyOffered }), opts);
      expect(r).toEqual({ offer: false, reason: 'already-offered' });
    });

    it('also blocks a shorter form of an offered phrase: "team" after "onboarding team"', () => {
      const recentlyOffered = new Map([['onboarding team', 99_000]]);
      const r = decideOffer(guess(['team', 0.9]), ctx({ recentlyOffered }), opts);
      expect(r).toEqual({ offer: false, reason: 'already-offered' });
    });

    it('blocks "waiting list" after only "list" was offered, on purpose: it is the same repeat, and a hand ask can still repeat', () => {
      const recentlyOffered = new Map([['list', 99_000]]);
      const r = decideOffer(guess(['waiting list', 0.9]), ctx({ recentlyOffered }), opts);
      expect(r).toEqual({ offer: false, reason: 'already-offered' });
    });

    it('does not block a different phrase that shares one word, or words that are not in a row', () => {
      const recentlyOffered = new Map([['onboarding', 99_000]]);
      expect(
        decideOffer(guess(['implementation team', 0.9]), ctx({ recentlyOffered }), opts).offer,
      ).toBe(true);
      const split = new Map([['team onboarding', 99_000]]);
      expect(
        decideOffer(guess(['team the onboarding', 0.9]), ctx({ recentlyOffered: split }), opts)
          .offer,
      ).toBe(true);
    });

    it('lets the longer form back in after the repeat window', () => {
      const recentlyOffered = new Map([['onboarding', 99_000]]);
      const r = decideOffer(
        guess(['onboarding team', 0.9]),
        ctx({ recentlyOffered, nowMs: 400_000 }),
        {
          ...opts,
          repeatMs: 180_000,
        },
      );
      expect(r.offer).toBe(true);
    });
  });
});
