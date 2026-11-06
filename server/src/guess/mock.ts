import type { Candidate } from '../events.js';
import type { Guesser } from './types.js';

// Deterministic stand-in for Claude when there is no API key. Each rule fires when all its
// phrases appear in the text. Covers the dev items in data/eval/circumlocutions.json only.
const RULES: { all: string[]; candidates: Candidate[] }[] = [
  {
    all: ['medicine'],
    candidates: [
      { word: 'pharmacy', confidence: 0.85 },
      { word: 'chemist', confidence: 0.6 },
      { word: 'hospital', confidence: 0.25 },
    ],
  },
  {
    all: ['wrist'],
    candidates: [
      { word: 'watch', confidence: 0.9 },
      { word: 'bracelet', confidence: 0.3 },
    ],
  },
  {
    all: ['cutting bread'],
    candidates: [
      { word: 'knife', confidence: 0.85 },
      { word: 'bread knife', confidence: 0.6 },
    ],
  },
  {
    all: ['hold over your head'],
    candidates: [
      { word: 'umbrella', confidence: 0.9 },
      { word: 'hat', confidence: 0.2 },
    ],
  },
  {
    all: ['does your teeth'],
    candidates: [
      { word: 'dentist', confidence: 0.9 },
      { word: 'hygienist', confidence: 0.3 },
    ],
  },
  {
    all: ['planes go'],
    candidates: [
      { word: 'airport', confidence: 0.9 },
      { word: 'terminal', confidence: 0.3 },
    ],
  },
];

export const mockGuesser: Guesser = (input) => {
  const text = `${input.conversation} ${input.stuckPhrase}`.toLowerCase();
  const rule = RULES.find((r) => r.all.every((phrase) => text.includes(phrase)));
  return Promise.resolve({
    candidates: rule ? rule.candidates.map((c) => ({ ...c })) : [],
    abstain: !rule,
    latencyMs: 0,
  });
};
