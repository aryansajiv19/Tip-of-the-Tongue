import { describe, expect, it } from 'vitest';
import { isStale, stampWords, tokenize } from './stampWords';

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

describe('tokenize', () => {
  it('splits on whitespace and drops bare punctuation', () => {
    expect(tokenize('  a - b\n,  c ')).toEqual(['a', 'b', 'c']);
  });
});

describe('tokenize, for scripts without spaces', () => {
  it('splits Chinese, Japanese and Thai into words instead of one giant token', () => {
    for (const text of [
      '我想要一杯咖啡和一个面包',
      '今日は天気がいいですね',
      'ฉันอยากได้กาแฟหนึ่งแก้ว',
    ]) {
      const words = tokenize(text);
      expect(words.length).toBeGreaterThan(2);
      expect(words.join('')).toBe(text);
    }
  });

  it('segments only the token that needs it, and leaves other words and their punctuation', () => {
    expect(tokenize('I said 你好吗 to Maria, today.')).toEqual([
      'I',
      'said',
      '你好',
      '吗',
      'to',
      'Maria,',
      'today.',
    ]);
    expect(tokenize('Hello, world. What?')).toEqual(['Hello,', 'world.', 'What?']);
  });

  it('drops the sentence marks of those scripts, which are not words', () => {
    expect(tokenize('你好，世界。')).toEqual(['你好', '世界']);
  });

  it('cuts any word to the 100 characters the server accepts', () => {
    const long = 'a'.repeat(300);
    expect(tokenize(`${long} ok`).map((t) => t.length)).toEqual([100, 2]);
    // Counted in characters, so a pair of UTF-16 units is never cut in half.
    expect(tokenize('𝐀'.repeat(150))[0]).toBe('𝐀'.repeat(100));
  });

  it('keeps times across a growing Chinese transcript', () => {
    const first = stampWords([], '我想要', 100);
    const grown = stampWords(first, '我想要一杯咖啡', 900);
    expect(grown.slice(0, first.length)).toEqual(first);
    expect(grown.slice(first.length).every((x) => x.startMs === 900)).toBe(true);
  });
});
