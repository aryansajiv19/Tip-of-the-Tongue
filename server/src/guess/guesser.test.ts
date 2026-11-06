import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { buildPrompt, createGuesser, modelOptions } from './guesser.js';
import { ProfileSchema } from './profile.js';

const cfg = { model: 'test-model', timeoutMs: 50 };
const input = { conversation: 'errands', stuckPhrase: 'the place where you get medicine' };

// A fake client: `create` is whatever the test needs. The cast is safe because the guesser only
// calls messages.create.
const fakeClient = (create: (...args: unknown[]) => unknown): Pick<Anthropic, 'messages'> =>
  ({ messages: { create } }) as unknown as Pick<Anthropic, 'messages'>;

const delta = (text: string) => ({
  type: 'content_block_delta',
  index: 0,
  delta: { type: 'text_delta', text },
});

// A streamed reply: one text delta per chunk. `after` runs once all chunks are out, so a test can
// make the stream hang or fail after the JSON has closed (or before it ever does).
async function* streamOf(chunks: string[], after?: () => Promise<void>) {
  for (const c of chunks) yield delta(c);
  await after?.();
  yield { type: 'message_delta', delta: { stop_reason: 'end_turn' } };
}
const streamClient = (chunks: string[], after?: () => Promise<void>) =>
  fakeClient(() => Promise.resolve(streamOf(chunks, after)));
const hang = () => new Promise<void>(() => undefined);

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
  const json = '{"candidates":[{"word":"renewal","confidence":0.8}],"abstain":false}';

  it('parses a streamed reply split across chunks', async () => {
    const guess = createGuesser(cfg, streamClient([json.slice(0, 20), json.slice(20)]));
    const r = await guess(input);
    expect(r.abstain).toBe(false);
    expect(r.candidates).toEqual([{ word: 'renewal', confidence: 0.8 }]);
    expect(r.error).toBeUndefined();
  });

  it('tolerates a fence and prose around the streamed JSON', async () => {
    const guess = createGuesser(cfg, streamClient(['Sure:\n```json\n', json, '\n```']));
    expect((await guess(input)).candidates[0]?.word).toBe('renewal');
  });

  it('returns as soon as the JSON closes, without waiting for the rest of the stream', async () => {
    let signal: AbortSignal | undefined;
    const guess = createGuesser(
      { model: 'test-model', timeoutMs: 5000 },
      fakeClient((_params, opts) => {
        signal = (opts as { signal: AbortSignal }).signal;
        return Promise.resolve(streamOf([json], hang)); // the stream never finishes
      }),
    );
    const r = await guess(input);
    expect(r.candidates).toEqual([{ word: 'renewal', confidence: 0.8 }]);
    expect(r.error).toBeUndefined();
    expect(r.latencyMs).toBeLessThan(1000);
    expect(signal?.aborted).toBe(true); // the rest of the reply is cancelled
  });

  it('asks for a stream with a small output cap and no thinking', async () => {
    let params: Record<string, unknown> = {};
    const guess = createGuesser(
      cfg,
      fakeClient((p) => {
        params = p as Record<string, unknown>;
        return Promise.resolve(streamOf([json]));
      }),
    );
    await guess(input);
    expect(params).toMatchObject({
      stream: true,
      model: 'test-model',
      thinking: { type: 'disabled' },
    });
    expect(params.max_tokens).toBeLessThanOrEqual(100);
    expect(params.max_tokens).toBeGreaterThanOrEqual(70);
  });

  it('abstains if the stream ends before the JSON closes', async () => {
    const r = await createGuesser(cfg, streamClient(['{"candidates":[{"word":"ren']))(input);
    expect(r.abstain).toBe(true);
    expect(r.error).toBeUndefined();
  });

  it('abstains with an error if the stream stalls before the JSON closes', async () => {
    const guess = createGuesser(cfg, streamClient(['{"candidates":['], hang));
    const r = await guess(input);
    expect(r.abstain).toBe(true);
    expect(r.error).toBe(true);
  });

  it('abstains with an error if the stream fails midway', async () => {
    const failing = streamClient(['{"cand'], () => Promise.reject(new Error('connection reset')));
    const r = await createGuesser(cfg, failing)(input);
    expect(r.abstain).toBe(true);
    expect(r.error).toBe(true);
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

  it('aborts the request on a timeout', async () => {
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

  it('aborts the stream when the caller no longer wants the answer', async () => {
    let signal: AbortSignal | undefined;
    const guess = createGuesser(
      { ...cfg, timeoutMs: 5000 },
      fakeClient((_params, opts) => {
        signal = (opts as { signal: AbortSignal }).signal;
        return new Promise(() => undefined);
      }),
    );
    const caller = new AbortController();
    const pending = guess(input, caller.signal);
    caller.abort();
    expect((await pending).error).toBe(true);
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

  it('abstains, without an error, on a refusal, garbage, or an empty reply', async () => {
    const refusal = fakeClient(() =>
      Promise.resolve(
        (async function* () {
          yield { type: 'message_delta', delta: { stop_reason: 'refusal' } };
        })(),
      ),
    );
    for (const client of [refusal, streamClient(['I cannot tell.']), streamClient([])]) {
      const r = await createGuesser(cfg, client)(input);
      expect(r.abstain).toBe(true);
      expect(r.error).toBeUndefined(); // the model chose to abstain; nothing failed
    }
  });
});

describe('modelOptions', () => {
  it('turns thinking off the way each model allows', () => {
    expect(modelOptions('claude-haiku-5-5').thinking).toEqual({ type: 'disabled' });
    expect(modelOptions('claude-sonnet-5-5').thinking).toEqual({ type: 'between_tools' });
  });
  it('never sends a disabled thinking config to Opus, and keeps effort low with room to think', () => {
    const o = modelOptions('claude-opus-5-5');
    expect(o.thinking).toBeUndefined();
    expect(o.output_config).toEqual({ effort: 'low' });
    expect(o.max_tokens).toBeGreaterThan(1000);
  });
  it('keeps the small output cap for the fast models', () => {
    expect(modelOptions('claude-haiku-5-5').max_tokens).toBeLessThanOrEqual(100);
    expect(modelOptions('claude-sonnet-5-5').max_tokens).toBeLessThanOrEqual(100);
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
