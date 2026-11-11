import type { Candidate, Language, Skill } from '../events.js';
import type { Profile } from './profile.js';

export interface GuessInput {
  conversation: string;
  stuckPhrase: string;
  // Words they said and took back ("the fork, no, the..."): not to be offered.
  rejected?: string[];
  // What they speak (default English). Sets the language the offered words are in.
  language?: Language;
  brief?: string;
  // The topics the user turned on (topic packs and their own): a hint for specialist words.
  skills?: Skill[];
  // Ask for, and keep, a few words that continue the sentence after each word (off by default).
  continuations?: boolean;
  profile?: Profile;
}

export interface GuessResult {
  candidates: Candidate[];
  abstain: boolean;
  latencyMs: number;
  // Prompt tokens read from / written to the cache on this call (Claude only). Both 0 means the
  // prefix was too short to cache.
  cacheRead?: number;
  cacheWrite?: number;
  // Set when the provider failed or timed out, as opposed to the model choosing to abstain.
  error?: true;
  // The HTTP status of an Anthropic error, and the wait it asked for (retry-after), if any.
  status?: number;
  retryAfterMs?: number;
}

// Never throws: errors and timeouts come back as an abstain with `error: true`.
// `signal` aborts the call when its result is no longer wanted.
export type Guesser = (input: GuessInput, signal?: AbortSignal) => Promise<GuessResult>;
