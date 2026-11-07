import { describe, expect, it } from 'vitest';
import type { Word } from '../events.js';
import { endsWithAskForWord } from './manual.js';

const say = (text: string): Word[] =>
  text.split(' ').map((t, i) => ({ text: t, startMs: i * 300, endMs: i * 300 + 250 }));

describe('endsWithAskForWord', () => {
  it.each([
    "what's the word",
    "what's the word for",
    'we need the uh what is the word for',
    "So, what's the word?",
    'WHATS THE WORD FOR',
    "it's the thing, what's the word",
  ])('true for %s', (text) => expect(endsWithAskForWord(say(text))).toBe(true));

  it.each([
    "I forgot what's the word you used yesterday",
    "what's the word for it in French again",
    'the word',
    'what the word',
    'password',
    "what's the sword",
    '',
  ])('false for %s', (text) => expect(endsWithAskForWord(say(text))).toBe(false));

  it('is false with no words at all', () => expect(endsWithAskForWord([])).toBe(false));
});
