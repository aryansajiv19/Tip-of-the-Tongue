import type { Candidate } from '../events.js';
import type { Profile } from './profile.js';

export interface GuessInput {
  conversation: string;
  stuckPhrase: string;
  brief?: string;
  profile?: Profile;
}

export interface GuessResult {
  candidates: Candidate[];
  abstain: boolean;
  latencyMs: number;
}

// Never throws: errors and timeouts come back as an abstain.
export type Guesser = (input: GuessInput) => Promise<GuessResult>;
