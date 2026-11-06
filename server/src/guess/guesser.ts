import Anthropic from '@anthropic-ai/sdk';
import { mockGuesser } from './mock.js';
import { firstObjectEnd, parseGuess } from './parse.js';
import { profileTermList } from './profile.js';
import type { GuessInput, GuessResult, Guesser } from './types.js';

const SYSTEM = `Someone has lost a word mid-conversation. Guess the word they are reaching for.
Reply with JSON only: {"candidates":[{"word":"...","confidence":0.0}],"abstain":false}
Up to 3 candidates, confidence 0 to 1. Keep multi-word names together as one candidate (e.g. "post office"). If you are not fairly sure, or they are not clearly searching for a specific word (the sentence is complete, or they are just thinking), reply {"candidates":[],"abstain":true}. A wrong guess is worse than none.`;

// 3 candidates of a few words each is about 70 tokens of JSON.
const MAX_TOKENS = 100;

export function buildPrompt(input: GuessInput): string {
  const parts: string[] = [];
  if (input.brief) parts.push(`Meeting brief:\n${input.brief}`);
  if (input.profile)
    parts.push(`Their personal words: ${profileTermList(input.profile).join(', ')}`);
  parts.push(`Conversation so far:\n${input.conversation}`);
  parts.push(`Just said (they are stuck here):\n${input.stuckPhrase}`);
  return parts.join('\n\n');
}

// Streams the reply and stops as soon as the JSON object closes, without waiting for the end of
// the message. Undefined if the model refused.
async function readReply(
  api: Pick<Anthropic, 'messages'>,
  model: string,
  input: GuessInput,
  controller: AbortController,
): Promise<string | undefined> {
  const stream = await api.messages.create(
    {
      model,
      ...modelOptions(model),
      system: SYSTEM,
      messages: [{ role: 'user', content: buildPrompt(input) }],
      stream: true,
    },
    { signal: controller.signal },
  );
  let text = '';
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      text += event.delta.text;
      const end = firstObjectEnd(text);
      if (end !== undefined) {
        controller.abort();
        return text.slice(0, end);
      }
    } else if (event.type === 'message_delta' && event.delta.stop_reason === 'refusal') {
      return undefined;
    }
  }
  return text;
}

// Newer models reject thinking: {type: 'disabled'}. Sonnet 5.5 turns thinking off with
// 'between_tools'. Opus 5.5 cannot turn it off, so it gets the lowest effort and room for the
// thinking tokens that count against max_tokens. Everything else (Haiku) uses 'disabled'.
export function modelOptions(model: string): {
  max_tokens: number;
  thinking?: { type: 'disabled' } | { type: 'between_tools' };
  output_config?: { effort: 'low' };
} {
  if (/opus|fable/.test(model)) return { max_tokens: 2000, output_config: { effort: 'low' } };
  if (/sonnet/.test(model)) return { max_tokens: MAX_TOKENS, thinking: { type: 'between_tools' } };
  return { max_tokens: MAX_TOKENS, thinking: { type: 'disabled' } };
}

export function createGuesser(
  cfg: { apiKey?: string; model: string; timeoutMs: number },
  // Injectable so tests never touch the network.
  client?: Pick<Anthropic, 'messages'>,
): Guesser {
  if (!cfg.apiKey && !client) return mockGuesser;
  const api = client ?? new Anthropic({ apiKey: cfg.apiKey, maxRetries: 0 });

  return async (input, signal): Promise<GuessResult> => {
    const started = Date.now();
    const abstain = (error?: true): GuessResult => ({
      candidates: [],
      abstain: true,
      latencyMs: Date.now() - started,
      ...(error ? { error } : {}),
    });
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    // The race also covers a client that ignores the abort signal.
    const timedOut = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(null);
      }, cfg.timeoutMs);
      signal?.addEventListener(
        'abort',
        () => {
          controller.abort();
          resolve(null);
        },
        { once: true },
      );
    });
    try {
      const text = await Promise.race([readReply(api, cfg.model, input, controller), timedOut]);
      if (text === null) return abstain(true); // timed out
      if (text === undefined) return abstain(); // refused
      return { ...parseGuess(text), latencyMs: Date.now() - started };
    } catch {
      return abstain(true);
    } finally {
      clearTimeout(timer);
    }
  };
}
