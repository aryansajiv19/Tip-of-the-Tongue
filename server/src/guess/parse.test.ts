import { describe, expect, it } from 'vitest';
import { firstObjectEnd, parseGuess } from './parse.js';

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

describe('firstObjectEnd', () => {
  it('is undefined while the object is still open', () => {
    expect(firstObjectEnd('')).toBeUndefined();
    expect(firstObjectEnd('no braces yet')).toBeUndefined();
    expect(firstObjectEnd('{"candidates":[{"word":"a"')).toBeUndefined();
    expect(firstObjectEnd('{"a":{"b":1}')).toBeUndefined();
  });
  it('returns the index just past the closing brace', () => {
    const text = '{"a":{"b":1}}';
    expect(firstObjectEnd(text)).toBe(text.length);
    expect(firstObjectEnd(`${text} trailing`)).toBe(text.length);
  });
  it('skips prose and fences before the object', () => {
    const text = 'Sure:\n```json\n{"a":1}\n```';
    expect(firstObjectEnd(text)).toBe(text.indexOf('}') + 1);
  });
  it('ignores braces and escaped quotes inside strings', () => {
    const text = '{"word":"a } b \\" } c","n":1}';
    expect(firstObjectEnd(text)).toBe(text.length);
    expect(firstObjectEnd('{"word":"open } still')).toBeUndefined();
  });
  it('stops at the first of two objects', () => {
    expect(firstObjectEnd('{"a":1}{"b":2}')).toBe(7);
  });
});

describe('a model that rambles or misbehaves', () => {
  it('drops a "word" that is a paragraph, keeps the real ones', () => {
    const essay = 'because '.repeat(2000);
    const reply = JSON.stringify({
      candidates: [
        { word: essay, confidence: 0.99 },
        { word: 'pharmacy', confidence: 0.8 },
      ],
    });
    expect(parseGuess(reply).candidates.map((c) => c.word)).toEqual(['pharmacy']);
  });

  it('abstains when the only candidate is a paragraph', () => {
    const reply = JSON.stringify({ candidates: [{ word: 'x'.repeat(5000), confidence: 1 }] });
    expect(parseGuess(reply).abstain).toBe(true);
  });

  it('keeps a long multi-word name up to the limit', () => {
    const name = 'Northwind Analytics Holdings International';
    expect(
      parseGuess(JSON.stringify({ candidates: [{ word: name, confidence: 0.9 }] })).candidates,
    ).toEqual([{ word: name, confidence: 0.9 }]);
  });

  it.each([
    ['truncated mid-string', '{"candidates":[{"word":"pharm'],
    ['truncated mid-object', '{"candidates":[{"word":"pharmacy","confidence":0.9}'],
    ['two objects', '{"abstain":true}{"candidates":[{"word":"a","confidence":1}]}'],
    ['a JSON array', '[{"word":"pharmacy","confidence":0.9}]'],
    ['null candidates', '{"candidates":null}'],
    ['candidates not a list', '{"candidates":"pharmacy"}'],
    ['words that are numbers', '{"candidates":[{"word":42,"confidence":0.9}]}'],
    ['only an apology', "I'm sorry, I can't help with that."],
    ['empty', ''],
    ['binary junk', '\u0000\u0001\ufffd{{{{'],
    ['an enormous number', '{"candidates":[{"word":"a","confidence":1e999}]}'],
  ])('never throws and offers nothing for %s', (_n, text) => {
    const result = parseGuess(text);
    expect(result).toEqual({ candidates: [], abstain: true });
  });
});
