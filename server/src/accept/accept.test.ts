import { describe, expect, it } from 'vitest';
import type { Word } from '../events.js';
import { checkAcceptance } from './accept.js';

const w = (text: string, startMs: number, endMs = startMs + 200): Word => ({
  text,
  startMs,
  endMs,
});
const offer = {
  candidates: [
    { word: 'renewal', confidence: 0.8 },
    { word: 'licence', confidence: 0.6 },
    { word: 'bread knife', confidence: 0.5 },
  ],
  offeredAtMs: 10_000,
};
const WINDOW = 8000;

describe('checkAcceptance', () => {
  it('is pending with nothing said yet', () => {
    expect(checkAcceptance(offer, [], 11_000, WINDOW)).toEqual({ status: 'pending' });
  });

  it('accepts a candidate spoken after the offer and reports the delay', () => {
    const r = checkAcceptance(offer, [w('renewal', 11_000, 11_500)], 12_000, WINDOW);
    expect(r).toEqual({ status: 'accepted', word: 'renewal', afterMs: 1500 });
  });

  it('ignores words spoken before the offer, and at the offer instant', () => {
    expect(checkAcceptance(offer, [w('renewal', 9_000, 9_400)], 11_000, WINDOW).status).toBe(
      'pending',
    );
    expect(checkAcceptance(offer, [w('renewal', 10_000, 10_300)], 11_000, WINDOW).status).toBe(
      'pending',
    );
    expect(checkAcceptance(offer, [w('renewal', 10_001, 10_300)], 11_000, WINDOW).status).toBe(
      'accepted',
    );
  });

  it('a word that started before the offer cannot complete a multi-word match', () => {
    const spoken = [w('bread', 9_900, 10_050), w('knife', 10_100)];
    expect(checkAcceptance(offer, spoken, 11_000, WINDOW).status).toBe('pending');
  });

  it('accepts the second or third candidate', () => {
    expect(checkAcceptance(offer, [w('licence', 11_000)], 12_000, WINDOW)).toMatchObject({
      status: 'accepted',
      word: 'licence',
    });
    const multi = [w('the', 11_000), w('bread', 11_300), w('knife', 11_600, 11_900)];
    expect(checkAcceptance(offer, multi, 12_000, WINDOW)).toEqual({
      status: 'accepted',
      word: 'bread knife',
      afterMs: 1900,
    });
  });

  it('does not accept half a multi-word candidate', () => {
    expect(checkAcceptance(offer, [w('bread', 11_000)], 12_000, WINDOW).status).toBe('pending');
  });

  it('matches despite case, punctuation and plural', () => {
    expect(checkAcceptance(offer, [w('Renewals,', 11_000)], 12_000, WINDOW).status).toBe(
      'accepted',
    );
  });

  it('when two candidates are spoken, the earlier one wins', () => {
    const spoken = [w('licence', 11_000), w('renewal', 12_000)];
    expect(checkAcceptance(offer, spoken, 13_000, WINDOW)).toMatchObject({ word: 'licence' });
  });

  it('accepts at exactly the window and not after it', () => {
    expect(checkAcceptance(offer, [w('renewal', 17_000, 18_000)], 18_000, WINDOW)).toMatchObject({
      status: 'accepted',
      afterMs: 8000,
    });
    expect(checkAcceptance(offer, [w('renewal', 17_500, 18_001)], 18_001, WINDOW).status).toBe(
      'expired',
    );
  });

  it('expires only after the window has passed with nothing accepted', () => {
    expect(checkAcceptance(offer, [w('hello', 11_000)], 18_000, WINDOW).status).toBe('pending');
    expect(checkAcceptance(offer, [w('hello', 11_000)], 18_001, WINDOW).status).toBe('expired');
  });

  it('an accepted word beats expiry', () => {
    expect(checkAcceptance(offer, [w('renewal', 12_000)], 99_000, WINDOW).status).toBe('accepted');
  });
});
