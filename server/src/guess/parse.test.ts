import { describe, expect, it } from 'vitest';
import { parseGuess } from './parse.js';

const json = (o: unknown): string => JSON.stringify(o);

describe('parseGuess', () => {
  it('parses plain JSON', () => {
    expect(
      parseGuess(json({ candidates: [{ word: 'pharmacy', confidence: 0.9 }], abstain: false })),
    ).toEqual({
      candidates: [{ word: 'pharmacy', confidence: 0.9 }],
      abstain: false,
    });
  });

  it('tolerates a code fence', () => {
    const text = '```json\n{"candidates":[{"word":"watch","confidence":0.8}],"abstain":false}\n```';
    expect(parseGuess(text).candidates).toEqual([{ word: 'watch', confidence: 0.8 }]);
  });

  it('tolerates prose around the JSON', () => {
    const text =
      'Sure! Here you go: {"candidates":[{"word":"knife","confidence":0.7}]} Hope that helps.';
    expect(parseGuess(text).candidates[0]?.word).toBe('knife');
  });

  it.each([
    '',
    'no json here',
    '{"candidates": [',
    '{broken}',
    '[1,2,3]',
    'null',
    '{"candidates":"x"}',
  ])('abstains on invalid input %j', (text) => {
    expect(parseGuess(text)).toEqual({ candidates: [], abstain: true });
  });

  it('keeps the top 3 by confidence when given more', () => {
    const candidates = ['a', 'b', 'c', 'd', 'e'].map((word, i) => ({
      word,
      confidence: 0.1 * (i + 1),
    }));
    expect(parseGuess(json({ candidates })).candidates.map((c) => c.word)).toEqual(['e', 'd', 'c']);
  });

  it('clamps confidence to 0..1', () => {
    const out = parseGuess(
      json({
        candidates: [
          { word: 'hi', confidence: 7 },
          { word: 'lo', confidence: -2 },
        ],
      }),
    );
    expect(out.candidates).toEqual([
      { word: 'hi', confidence: 1 },
      { word: 'lo', confidence: 0 },
    ]);
  });

  it('accepts numeric strings and drops non-numeric confidence', () => {
    const out = parseGuess(
      json({
        candidates: [
          { word: 'ok', confidence: '0.8' },
          { word: 'bad', confidence: 'high' },
          { word: 'blank', confidence: '' },
          { word: 'nul', confidence: null },
          { word: 'inf', confidence: 'Infinity' },
        ],
      }),
    );
    expect(out.candidates).toEqual([{ word: 'ok', confidence: 0.8 }]);
  });

  it('dedupes case-insensitively, keeping the highest confidence', () => {
    const out = parseGuess(
      json({
        candidates: [
          { word: 'Pharmacy', confidence: 0.4 },
          { word: 'pharmacy', confidence: 0.9 },
        ],
      }),
    );
    expect(out.candidates).toEqual([{ word: 'pharmacy', confidence: 0.9 }]);
  });

  it('drops empty and whitespace-only words, and trims', () => {
    const out = parseGuess(
      json({
        candidates: [
          { word: '', confidence: 0.9 },
          { word: '   ', confidence: 0.9 },
          { word: ' cat ', confidence: 0.5 },
        ],
      }),
    );
    expect(out.candidates).toEqual([{ word: 'cat', confidence: 0.5 }]);
  });

  it('drops malformed items but keeps the good ones', () => {
    const out = parseGuess(
      json({
        candidates: ['x', 5, null, { word: 'ok', confidence: 0.6 }, { word: 3, confidence: 1 }],
      }),
    );
    expect(out.candidates).toEqual([{ word: 'ok', confidence: 0.6 }]);
  });

  it('abstains on an empty list, with or without the abstain flag', () => {
    expect(parseGuess(json({ candidates: [], abstain: false }))).toEqual({
      candidates: [],
      abstain: true,
    });
    expect(parseGuess(json({ candidates: [] }))).toEqual({ candidates: [], abstain: true });
    expect(parseGuess(json({}))).toEqual({ candidates: [], abstain: true });
  });

  it('abstain:true wins over candidates', () => {
    expect(
      parseGuess(json({ candidates: [{ word: 'x', confidence: 0.99 }], abstain: true })),
    ).toEqual({
      candidates: [],
      abstain: true,
    });
  });
});
