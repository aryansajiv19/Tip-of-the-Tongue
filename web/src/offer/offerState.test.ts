import { describe, expect, it } from 'vitest';
import { offerReducer, type OfferState } from './offerState';

const offered = (id: string, words: [string, number][]) =>
  ({
    type: 'guess.offered',
    id,
    latencyMs: 10,
    candidates: words.map(([word, confidence]) => ({ word, confidence })),
  }) as const;

const open: OfferState = { id: 'a', candidates: [{ word: 'renewal', confidence: 0.9 }] };

describe('offerReducer', () => {
  it('shows an offer, best first, at most 3', () => {
    const s = offerReducer(
      null,
      offered('a', [
        ['b', 0.5],
        ['d', 0.2],
        ['a', 0.9],
        ['c', 0.4],
      ]),
    );
    expect(s?.candidates.map((c) => c.word)).toEqual(['a', 'b', 'c']);
  });

  it('ignores an offer with no candidates', () => {
    expect(offerReducer(null, offered('a', []))).toBeNull();
    expect(offerReducer(open, offered('b', []))).toBe(open);
  });

  it('a new offer replaces the old one', () => {
    expect(offerReducer(open, offered('b', [['x', 0.7]]))?.id).toBe('b');
  });

  it.each(['guess.withdrawn', 'guess.expired'] as const)('%s clears the matching offer', (type) => {
    const action =
      type === 'guess.withdrawn'
        ? { type, id: 'a', reason: 'timeout' as const }
        : { type, id: 'a' };
    expect(offerReducer(open, action)).toBeNull();
  });

  it('ignores withdrawn/expired/accepted for another id', () => {
    expect(offerReducer(open, { type: 'guess.expired', id: 'zzz' })).toBe(open);
    expect(offerReducer(open, { type: 'guess.withdrawn', id: 'zzz', reason: 'timeout' })).toBe(
      open,
    );
    expect(offerReducer(open, { type: 'guess.accepted', id: 'zzz', word: 'x', afterMs: 1 })).toBe(
      open,
    );
  });

  it('marks the accepted word and keeps the offer until cleared', () => {
    const s = offerReducer(open, {
      type: 'guess.accepted',
      id: 'a',
      word: 'renewal',
      afterMs: 800,
    });
    expect(s?.acceptedWord).toBe('renewal');
    expect(offerReducer(s, { type: 'offer.clear' })).toBeNull();
  });

  it('does nothing for events with no offer open', () => {
    expect(offerReducer(null, { type: 'guess.expired', id: 'a' })).toBeNull();
    expect(
      offerReducer(null, { type: 'guess.accepted', id: 'a', word: 'x', afterMs: 1 }),
    ).toBeNull();
    expect(
      offerReducer(null, { type: 'stuck.detected', reason: 'pause', contextWindow: '' }),
    ).toBeNull();
  });

  it('stuck.detected leaves an open offer alone', () => {
    expect(
      offerReducer(open, { type: 'stuck.detected', reason: 'filler', contextWindow: '' }),
    ).toBe(open);
  });

  it('does not mutate the incoming candidates', () => {
    const e = offered('a', [
      ['b', 0.5],
      ['a', 0.9],
    ]);
    offerReducer(null, e);
    expect(e.candidates.map((c) => c.word)).toEqual(['b', 'a']);
  });
});
