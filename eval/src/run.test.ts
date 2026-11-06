import { describe, expect, it } from 'vitest';
import { createGuesser } from '../../server/src/guess/guesser.js';
import { ProfileSchema } from '../../server/src/guess/profile.js';
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

describe('runItem options', () => {
  it('leaves out the brief and profile with context off', async () => {
    const seen: { brief: string | undefined; profile: unknown }[] = [];
    const spy: typeof guess = (input) => {
      seen.push({ brief: input.brief, profile: input.profile });
      return guess(input);
    };
    const withBrief = item({ brief: 'Northwind renewal' });
    await runItem(withBrief, spy, profile, { context: true, sttNoise: false });
    await runItem(withBrief, spy, profile, { context: false, sttNoise: false });
    expect(seen[0]).toEqual({ brief: 'Northwind renewal', profile });
    expect(seen[1]).toEqual({ brief: undefined, profile: undefined });
  });

  it('records noise counts only with stt noise on', async () => {
    expect((await runItem(item({}), guess, profile)).noise).toBeUndefined();
    const noisy = await runItem(item({}), guess, profile, { context: true, sttNoise: true });
    expect(noisy.noise?.eligible).toBeGreaterThan(0);
  });
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
    expect(r.target).toBe('hospital');
    expect(r.offeredWords).toContain('pharmacy');
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
      utterance: 'I went to the pharmacy this morning.',
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
