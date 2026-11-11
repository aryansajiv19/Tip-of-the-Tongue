import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { buildPrompt, createGuesser, modelOptions, stablePrompt } from './guesser.js';
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
    expect(r.candidates[0]).toEqual({
      word: 'pharmacy',
      confidence: 0.85,
      continuation: 'to collect my tablets',
    });
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
    expect(params.max_tokens).toBeLessThanOrEqual(160);
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

  it('reports the status and retry-after of an API error, and logs the status without the text', async () => {
    const failures: unknown[] = [];
    const guess = createGuesser(
      { ...cfg, onFailure: (i) => failures.push(i) },
      fakeClient(() =>
        Promise.reject(
          Anthropic.APIError.generate(
            429,
            { type: 'error', error: { type: 'rate_limit_error', message: 'the pharmacy line' } },
            'the pharmacy line',
            new Headers({ 'retry-after': '7' }),
          ),
        ),
      ),
    );
    const r = await guess(input);
    expect(r).toMatchObject({ error: true, status: 429, retryAfterMs: 7000 });
    expect(failures).toEqual([{ status: 429, error: 'RateLimitError' }]);
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
    expect(modelOptions('claude-haiku-5-5').max_tokens).toBeLessThanOrEqual(160);
    expect(modelOptions('claude-sonnet-5-5').max_tokens).toBeLessThanOrEqual(160);
  });
});

describe('language in the prompt', () => {
  const line = (language?: Parameters<typeof buildPrompt>[0]['language']) =>
    stablePrompt({ ...input, ...(language ? { language } : {}) });

  it('English asks for the English word, never the foreign one', () => {
    expect(line()).toContain('offer the English word for it, never the foreign word');
    expect(line('en')).toBe(line());
  });
  it('another language asks for words in it', () => {
    expect(line('es')).toContain('They speak Spanish. Offer words in Spanish, not English.');
    expect(line('hi')).toContain('Hindi');
  });
  it('multi follows the sentence', () => {
    expect(line('multi')).toContain('in the language of the sentence they are in');
  });
});

describe('buildPrompt', () => {
  it('includes brief, profile words and the recent text', () => {
    const profile = ProfileSchema.parse({
      pets: { dog: 'Biscuit' },
      frequentlyLostWords: ['kettle'],
    });
    const i = { ...input, brief: 'Q3 review with Northwind', profile };
    const p = `${stablePrompt(i)}\n${buildPrompt(i)}`;
    expect(p).toContain('Northwind');
    expect(p).toContain('Biscuit');
    expect(p).toContain('kettle');
    expect(p).toContain('the place where you get medicine');
  });

  it('leaves out the brief and profile when absent', () => {
    const p = `${stablePrompt(input)}\n${buildPrompt(input)}`;
    expect(p).not.toContain('brief');
    expect(p).not.toContain('personal');
  });
});

describe('prompt caching', () => {
  const json = '{"candidates":[{"word":"pharmacy","confidence":0.8}],"abstain":false}';

  it('puts the brief, profile and language in a cached system block, and the conversation in the message', async () => {
    let params: { system?: unknown; messages?: { content: string }[] } = {};
    const guess = createGuesser(
      cfg,
      fakeClient((p) => {
        params = p as typeof params;
        return Promise.resolve(streamOf([json]));
      }),
    );
    await guess({ ...input, brief: 'Q3 review with Northwind' });
    const system = params.system as { text: string; cache_control?: unknown }[];
    expect(system).toHaveLength(2);
    expect(system[0]?.cache_control).toBeUndefined();
    expect(system[1]?.text).toContain('Northwind');
    expect(system[1]?.cache_control).toEqual({ type: 'ephemeral' });
    expect(params.messages?.[0]?.content).toContain('the place where you get medicine');
    expect(params.messages?.[0]?.content).not.toContain('Northwind');
  });

  it('reports the cache tokens the API says it read and wrote', async () => {
    async function* withUsage() {
      yield {
        type: 'message_start',
        message: { usage: { cache_read_input_tokens: 900, cache_creation_input_tokens: 0 } },
      };
      yield* streamOf([json]);
    }
    const r = await createGuesser(
      cfg,
      fakeClient(() => Promise.resolve(withUsage())),
    )(input);
    expect(r).toMatchObject({ cacheRead: 900, cacheWrite: 0 });
  });

  it('has no cache fields when the stream sends no usage', async () => {
    const r = await createGuesser(cfg, streamClient([json]))(input);
    expect(r).not.toHaveProperty('cacheRead');
  });
});

describe('topics in the cached prefix', () => {
  const skills = [
    { name: 'Medical visit', description: 'Appointments.', terms: ['referral', 'dosage'] },
  ];

  it('lists the active skills and their words in the stable block, not the message', () => {
    const stable = stablePrompt({ ...input, skills });
    expect(stable).toContain('Medical visit: Appointments. Words: referral, dosage');
    expect(buildPrompt({ ...input, skills })).not.toContain('referral');
  });

  it('adds nothing without skills', () => {
    expect(stablePrompt({ ...input, skills: [] })).not.toContain('Topics');
    expect(stablePrompt(input)).not.toContain('Topics');
  });

  it('puts topics after the personal words and before the language line', () => {
    const profile = ProfileSchema.parse({ pets: { dog: 'Biscuit' } });
    const p = stablePrompt({ ...input, profile, skills });
    expect(p.indexOf('Biscuit')).toBeLessThan(p.indexOf('Topics'));
    expect(p.indexOf('Topics')).toBeLessThan(p.indexOf('They speak English'));
  });
});
