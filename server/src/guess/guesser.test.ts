import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { buildPrompt, createGuesser } from './guesser.js';
import { ProfileSchema } from './profile.js';

const cfg = { model: 'test-model', timeoutMs: 50 };
const input = { conversation: 'errands', stuckPhrase: 'the place where you get medicine' };

// A fake client: `create` is whatever the test needs. The cast is safe because the guesser only
// calls messages.create.
const fakeClient = (create: (...args: unknown[]) => unknown): Pick<Anthropic, 'messages'> =>
  ({ messages: { create } }) as unknown as Pick<Anthropic, 'messages'>;

const textReply = (text: string) => ({
  stop_reason: 'end_turn',
  content: [{ type: 'text', text }],
});

describe('mock guesser (no api key)', () => {
  const guess = createGuesser(cfg);

  it('offers pharmacy for the demo line', async () => {
    const r = await guess(input);
    expect(r.abstain).toBe(false);
    expect(r.candidates[0]).toEqual({ word: 'pharmacy', confidence: 0.85 });
  });

  it('is deterministic', async () => {
    expect(await guess(input)).toEqual(await guess(input));
  });

  it('abstains on text it does not know', async () => {
    const r = await guess({ conversation: '', stuckPhrase: 'I left it in the car' });
    expect(r).toEqual({ candidates: [], abstain: true, latencyMs: 0 });
  });

  it('abstains on fluent speech that names the word', async () => {
    const r = await guess({ conversation: '', stuckPhrase: 'I went to the pharmacy this morning' });
    expect(r.abstain).toBe(true);
  });
});

describe('Claude guesser', () => {
  it('parses the model reply', async () => {
    const guess = createGuesser(
      cfg,
      fakeClient(() =>
        Promise.resolve(textReply('{"candidates":[{"word":"renewal","confidence":0.8}]}')),
      ),
    );
    const r = await guess(input);
    expect(r.abstain).toBe(false);
    expect(r.candidates).toEqual([{ word: 'renewal', confidence: 0.8 }]);
  });

  it('abstains on a timeout, even if the client ignores the abort signal', async () => {
    const guess = createGuesser(
      cfg,
      fakeClient(() => new Promise(() => undefined)),
    );
    const r = await guess(input);
    expect(r.abstain).toBe(true);
    expect(r.error).toBe(true);
    expect(r.candidates).toEqual([]);
    expect(r.latencyMs).toBeLessThan(500);
  });

  it('passes an abort signal to the client', async () => {
    let signal: AbortSignal | undefined;
    const guess = createGuesser(
      cfg,
      fakeClient((_params, opts) => {
        signal = (opts as { signal: AbortSignal }).signal;
        return new Promise(() => undefined);
      }),
    );
    await guess(input);
    expect(signal?.aborted).toBe(true);
  });

  it('abstains when the SDK throws', async () => {
    const guess = createGuesser(
      cfg,
      fakeClient(() => Promise.reject(new Error('529 overloaded'))),
    );
    const r = await guess(input);
    expect(r.abstain).toBe(true);
    expect(r.error).toBe(true);
  });

  it('abstains when the client throws synchronously', async () => {
    const guess = createGuesser(
      cfg,
      fakeClient(() => {
        throw new Error('boom');
      }),
    );
    const r = await guess(input);
    expect(r.abstain).toBe(true);
    expect(r.error).toBe(true);
  });

  it('abstains on a refusal, garbage, or an empty reply', async () => {
    const replies = [
      { stop_reason: 'refusal', content: [] },
      textReply('I cannot tell.'),
      { stop_reason: 'end_turn', content: [] },
    ];
    for (const reply of replies) {
      const guess = createGuesser(
        cfg,
        fakeClient(() => Promise.resolve(reply)),
      );
      const r = await guess(input);
      expect(r.abstain).toBe(true);
      expect(r.error).toBeUndefined(); // the model chose to abstain; nothing failed
    }
  });
});

describe('buildPrompt', () => {
  it('includes brief, profile words and the recent text', () => {
    const profile = ProfileSchema.parse({
      pets: { dog: 'Biscuit' },
      frequentlyLostWords: ['kettle'],
    });
    const p = buildPrompt({ ...input, brief: 'Q3 review with Northwind', profile });
    expect(p).toContain('Northwind');
    expect(p).toContain('Biscuit');
    expect(p).toContain('kettle');
    expect(p).toContain('the place where you get medicine');
  });

  it('leaves out the brief and profile when absent', () => {
    const p = buildPrompt(input);
    expect(p).not.toContain('brief');
    expect(p).not.toContain('personal');
  });
});
