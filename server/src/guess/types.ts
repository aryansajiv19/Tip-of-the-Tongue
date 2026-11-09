import type { Candidate } from '../events.js';
import type { Profile } from './profile.js';

export interface GuessInput {
  conversation: string;
  stuckPhrase: string;
  // Words they said and took back ("the fork, no, the..."): not to be offered.
  rejected?: string[];
  brief?: string;
  profile?: Profile;
}

export interface GuessResult {
  candidates: Candidate[];
  abstain: boolean;
  latencyMs: number;
  // Set when the provider failed or timed out, as opposed to the model choosing to abstain.
  error?: true;
}

// Never throws: errors and timeouts come back as an abstain with `error: true`.
// `signal` aborts the call when its result is no longer wanted.
export type Guesser = (input: GuessInput, signal?: AbortSignal) => Promise<GuessResult>;
