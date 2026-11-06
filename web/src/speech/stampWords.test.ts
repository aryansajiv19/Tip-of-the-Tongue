import { describe, expect, it } from 'vitest';
import { flushPending, isStale, stampResult, stampWords } from './stampWords';

const w = (text: string, t: number) => ({ text, startMs: t, endMs: t });

describe('stampWords', () => {
  it('stamps every word of a first result with now', () => {
    expect(stampWords([], 'we need the', 100)).toEqual([
      w('we', 100),
      w('need', 100),
      w('the', 100),
    ]);
  });

  it('keeps old times and stamps only new words when the result grows', () => {
    const first = stampWords([], 'we need', 100);
    expect(stampWords(first, 'we need the', 900)).toEqual([
      w('we', 100),
      w('need', 100),
      w('the', 900),
    ]);
  });

  it('leaves the last word old when nothing new arrives (silence)', () => {
    const first = stampWords([], 'we need', 100);
    const again = stampWords(first, 'we need', 5000);
    expect(again).toEqual(first);
    expect(again.at(-1)?.endMs).toBe(100);
  });

  it('a rewritten word keeps the time of the word it replaced', () => {
    const first = stampWords([], 'we need the thing', 100);
    expect(stampWords(first, 'we knead the thing', 500)).toEqual([
      w('we', 100),
      w('knead', 100),
      w('the', 100),
      w('thing', 100),
    ]);
  });

  it('a final that rewrites the whole utterance keeps every old time', () => {
    const first = stampWords([], 'one two three', 100);
    expect(stampWords(first, 'Won, too, tree.', 9000).map((x) => x.startMs)).toEqual([
      100, 100, 100,
    ]);
  });

  it('a rewrite that adds words stamps only the extra ones', () => {
    const first = stampWords([], 'a b', 100);
    expect(stampWords(first, 'x y z', 900).map((x) => x.startMs)).toEqual([100, 100, 900]);
  });

  it('ignores punctuation and bare punctuation tokens', () => {
    const first = stampWords([], 'hello world', 100);
    expect(stampWords(first, 'Hello, world. - again!', 400)).toEqual([
      w('hello', 100),
      w('world', 100),
      w('again!', 400),
    ]);
  });

  it('treats numerals and digits as words', () => {
    expect(stampWords([], 'room 42', 1).map((x) => x.text)).toEqual(['room', '42']);
  });

  it('keeps the prefix when the result shrinks', () => {
    const first = stampWords([], 'a b c', 100);
    expect(stampWords(first, 'a b', 200)).toEqual([w('a', 100), w('b', 100)]);
  });

  it('ignores casing changes and keeps the original word', () => {
    const first = stampWords([], 'hello world', 100);
    expect(stampWords(first, 'Hello World again', 300)).toEqual([
      w('hello', 100),
      w('world', 100),
      w('again', 300),
    ]);
  });

  it('ignores extra, leading, trailing and odd whitespace', () => {
    expect(stampWords([], '  we   need\tthe\n', 7)).toEqual([
      w('we', 7),
      w('need', 7),
      w('the', 7),
    ]);
  });

  it('returns nothing for empty or blank text', () => {
    expect(stampWords([], '', 1)).toEqual([]);
    expect(stampWords([], '   ', 1)).toEqual([]);
    expect(stampWords([w('a', 1)], '', 2)).toEqual([]);
  });

  it('does not change its input', () => {
    const prev = [w('a', 1)];
    stampWords(prev, 'a b', 2);
    expect(prev).toEqual([w('a', 1)]);
  });

  it('handles a repeated word without confusing positions', () => {
    const first = stampWords([], 'the the', 100);
    expect(stampWords(first, 'the the the', 200)).toEqual([
      w('the', 100),
      w('the', 100),
      w('the', 200),
    ]);
  });

  it('keeps times in non-decreasing order', () => {
    const a = stampWords([], 'one two', 100);
    const b = stampWords(a, 'one too three', 400);
    const starts = b.map((x) => x.startMs);
    expect(starts).toEqual([...starts].sort((x, y) => x - y));
  });
});

describe('stampResult', () => {
  it('a partial returns the same words as rest', () => {
    const r = stampResult([], 'we need', false, 100);
    expect(r.rest).toEqual(r.words);
  });

  it('a final that matches the partial leaves nothing over', () => {
    const p = stampResult([], 'we need the', false, 100).rest;
    const f = stampResult(p, 'We need the.', true, 5000);
    expect(f.words.map((x) => x.startMs)).toEqual([100, 100, 100]);
    expect(f.rest).toEqual([]);
  });

  it('a sentence split in two results keeps the second part old', () => {
    const p = stampResult([], 'we need the thing', false, 100).rest;
    const first = stampResult(p, 'we need the', true, 3000);
    expect(first.words).toHaveLength(3);
    expect(first.rest).toEqual([w('thing', 100)]);
    const second = stampResult(first.rest, 'thing', false, 3100);
    expect(second.words).toEqual([w('thing', 100)]);
  });

  it('a split continued with new words stamps only the new ones', () => {
    const p = stampResult([], 'a b c', false, 100).rest;
    const first = stampResult(p, 'a b', true, 2000);
    const second = stampResult(first.rest, 'c d', false, 2100);
    expect(second.words.map((x) => x.startMs)).toEqual([100, 2100]);
  });

  it('a final longer than the partial adds only new words and leaves no rest', () => {
    const p = stampResult([], 'we need', false, 100).rest;
    const f = stampResult(p, 'we need the thing', true, 700);
    expect(f.words.map((x) => x.startMs)).toEqual([100, 100, 700, 700]);
    expect(f.rest).toEqual([]);
  });

  it('a final with no words (empty result) returns nothing', () => {
    expect(stampResult([], '  ', true, 1)).toEqual({ words: [], rest: [] });
  });
});

describe('isStale', () => {
  it('is stale only while listening and after 20 s of nothing', () => {
    expect(isStale(true, 0, 20_000)).toBe(false);
    expect(isStale(true, 0, 20_001)).toBe(true);
    expect(isStale(false, 0, 99_000)).toBe(false);
  });

  it('honours a custom limit', () => {
    expect(isStale(true, 1000, 1600, 500)).toBe(true);
  });
});

describe('flushPending', () => {
  it('sends pending words unchanged and leaves nothing pending', () => {
    const pending = stampWords([], 'hello there', 100);
    const { send, rest } = flushPending(pending);
    expect(send).toBe(pending);
    expect(send?.map((x) => x.startMs)).toEqual([100, 100]);
    expect(rest).toEqual([]);
  });

  it('sends nothing when no partial is pending', () => {
    expect(flushPending([])).toEqual({ send: null, rest: [] });
  });
});
