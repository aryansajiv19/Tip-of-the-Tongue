import { describe, expect, it } from 'vitest';
import { stampWords } from './stampWords';

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

  it('treats a rewritten word and everything after it as new', () => {
    const first = stampWords([], 'we need the thing', 100);
    expect(stampWords(first, 'we knead the thing', 500)).toEqual([
      w('we', 100),
      w('knead', 500),
      w('the', 500),
      w('thing', 500),
    ]);
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
