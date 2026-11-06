import { describe, expect, it } from 'vitest';
import { createGuesser, ProfileSchema } from '../../server/src/guess/index.js';
import type { Item } from './dataset.js';
import { runItem } from './run.js';

const guess = createGuesser({ model: 'unused', timeoutMs: 100 });
const profile = ProfileSchema.parse({});
const item = (over: Partial<Item>): Item => ({
  id: 't',
  context: 'Talking about errands',
  utterance: 'I need to go to the... the place... where you get medicine',
  target: 'pharmacy',
  acceptable: ['pharmacy', 'chemist'],
  category: 'place',
  split: 'dev',
  ...over,
});

describe('runItem (mock guesser)', () => {
  it('scores a correct offer', async () => {
    const r = await runItem(item({}), guess, profile);
    expect(r).toMatchObject({
      kind: 'stall',
      top1: true,
      top3: true,
      offered: true,
      falseOffer: false,
    });
  });

  it('counts a wrong offer as a false offer', async () => {
    const r = await runItem(item({ acceptable: ['hospital'], target: 'hospital' }), guess, profile);
    expect(r).toMatchObject({ top1: false, offered: true, falseOffer: true });
  });

  it('stays silent when the user already said the word after stalling', async () => {
    const said = item({
      utterance: 'I need to go to the... medicine place, the pharmacy',
      category: 'self_recovered',
      target: null,
      acceptable: [],
    });
    expect(await runItem(said, guess, profile)).toMatchObject({
      kind: 'silent',
      offered: false,
      falseOffer: false,
    });
  });

  it('makes no guess when the detector does not fire', async () => {
    const quiet = item({
      utterance: 'I went to the pharmacy this morning',
      category: 'not_stuck',
      target: null,
      acceptable: [],
    });
    expect(await runItem(quiet, guess, profile)).toMatchObject({
      detected: false,
      offered: false,
      latencyMs: undefined,
    });
  });
});
