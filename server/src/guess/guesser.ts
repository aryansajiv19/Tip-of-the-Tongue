import Anthropic from '@anthropic-ai/sdk';
import { mockGuesser } from './mock.js';
import { parseGuess } from './parse.js';
import type { Profile } from './profile.js';
import type { GuessInput, GuessResult, Guesser } from './types.js';

const SYSTEM = `You help someone who has lost a word mid-conversation. From the conversation and what they said, guess the word they are reaching for.
Reply with JSON only: {"candidates":[{"word":"...","confidence":0.0}],"abstain":false}
Up to 3 candidates, confidence 0 to 1. Keep multi-word names together as one candidate (e.g. "post office"). Abstaining is good: if you are not fairly sure, reply {"candidates":[],"abstain":true}. A wrong guess is worse than none.`;

function profileTerms(profile: Profile): string {
  return [
    ...Object.values(profile.people),
    ...Object.values(profile.pets),
    ...Object.values(profile.places),
    ...profile.hobbies,
    ...profile.frequentlyLostWords,
  ].join(', ');
}

export function buildPrompt(input: GuessInput): string {
  const parts: string[] = [];
  if (input.brief) parts.push(`Meeting brief:\n${input.brief}`);
  if (input.profile) parts.push(`Their personal words: ${profileTerms(input.profile)}`);
  parts.push(`Conversation so far:\n${input.conversation}`);
  parts.push(`Just said (they are stuck here):\n${input.stuckPhrase}`);
  return parts.join('\n\n');
}

export function createGuesser(
  cfg: { apiKey?: string; model: string; timeoutMs: number },
  // Injectable so tests never touch the network.
  client?: Pick<Anthropic, 'messages'>,
): Guesser {
  if (!cfg.apiKey && !client) return mockGuesser;
  const api = client ?? new Anthropic({ apiKey: cfg.apiKey, maxRetries: 0 });

  return async (input): Promise<GuessResult> => {
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
    });
    try {
      const reply = await Promise.race([
        api.messages.create(
          {
            model: cfg.model,
            max_tokens: 200,
            thinking: { type: 'disabled' },
            system: SYSTEM,
            messages: [{ role: 'user', content: buildPrompt(input) }],
          },
          { signal: controller.signal },
        ),
        timedOut,
      ]);
      if (!reply) return abstain(true); // timed out
      if (reply.stop_reason === 'refusal') return abstain();
      const text = reply.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
      return { ...parseGuess(text), latencyMs: Date.now() - started };
    } catch {
      return abstain(true);
    } finally {
      clearTimeout(timer);
    }
  };
}
