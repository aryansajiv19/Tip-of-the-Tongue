import { describe, expect, it } from 'vitest';
import type { Word } from '../events.js';
import { findPhrase, normalizeWord } from './normalize.js';

const words = (...texts: string[]): Word[] =>
  texts.map((text, i) => ({ text, startMs: i * 100, endMs: i * 100 + 90 }));

describe('normalizeWord', () => {
  it.each([
    ['Chemist', 'chemist'],
    ["chemist's", 'chemist'],
    ['Chemist’s', 'chemist'],
    ['chemists', 'chemist'],
    ["chemists'", 'chemist'],
    ['Pharmacy,', 'pharmacy'],
    ['pharmacies', 'pharmacy'],
    ['"licence."', 'licence'],
    ['boxes', 'box'],
    ['glasses', 'glass'],
    ['glass', 'glass'],
    ['bus', 'bus'],
    ['', ''],
    ['...', ''],
  ])('%j -> %j', (raw, expected) => {
    expect(normalizeWord(raw)).toBe(expected);
  });
});

describe('findPhrase', () => {
  it('finds a single word, ignoring case and punctuation', () => {
    expect(findPhrase(words('I', 'need', 'the', 'Chemist,'), "chemist's")).toBe(3);
  });

  it('finds a multi-word phrase as a contiguous run', () => {
    expect(findPhrase(words('the', 'bread', 'knife'), 'bread knife')).toBe(1);
    expect(findPhrase(words('bread', 'and', 'knife'), 'bread knife')).toBe(-1);
  });

  it('returns -1 for no match, empty phrase or empty speech', () => {
    expect(findPhrase(words('hello'), 'knife')).toBe(-1);
    expect(findPhrase(words('hello'), '  ')).toBe(-1);
    expect(findPhrase([], 'knife')).toBe(-1);
  });

  it('does not match a phrase longer than the speech', () => {
    expect(findPhrase(words('bread'), 'bread knife')).toBe(-1);
  });
});
