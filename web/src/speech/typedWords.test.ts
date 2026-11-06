import { describe, expect, it } from 'vitest';
import { typedSteps } from './typedWords';

describe('typedSteps', () => {
  it('gives growing prefixes 300 ms apart', () => {
    expect(typedSteps('the thing you')).toEqual([
      { transcript: 'the', delayMs: 300 },
      { transcript: 'the thing', delayMs: 600 },
      { transcript: 'the thing you', delayMs: 900 },
    ]);
  });

  it('copes with extra spaces and returns nothing for blank input', () => {
    expect(typedSteps('  a   b ').map((s) => s.transcript)).toEqual(['a', 'a b']);
    expect(typedSteps('   ')).toEqual([]);
    expect(typedSteps('')).toEqual([]);
  });
});
