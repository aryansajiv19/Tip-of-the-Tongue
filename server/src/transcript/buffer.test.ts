import { describe, expect, it } from 'vitest';
import type { Word } from '../events.js';
import { TranscriptBuffer } from './buffer.js';

const w = (text: string, startMs: number): Word => ({ text, startMs, endMs: startMs + 200 });

describe('TranscriptBuffer', () => {
  it('is empty at the start', () => {
    const b = new TranscriptBuffer();
    expect(b.words()).toEqual([]);
    expect(b.recentText()).toBe('');
    expect(b.wordsSince(0)).toEqual([]);
  });

  it('a partial replaces the previous partial', () => {
    const b = new TranscriptBuffer();
    b.applyPartial([w('hello', 0)]);
    b.applyPartial([w('hello', 0), w('there', 300)]);
    expect(b.recentText()).toBe('hello there');
  });

  it('a final is appended and clears the partial', () => {
    const b = new TranscriptBuffer();
    b.applyFinal([w('one', 0)]);
    b.applyPartial([w('two', 300)]);
    expect(b.recentText()).toBe('one two');
    b.applyFinal([w('two', 300)]);
    b.applyPartial([]);
    b.applyFinal([w('three', 600)]);
    expect(b.recentText()).toBe('one two three');
  });

  it('puts finals before the live partial, in time order', () => {
    const b = new TranscriptBuffer();
    b.applyPartial([w('later', 1000)]);
    b.applyFinal([w('earlier', 0)]);
    b.applyPartial([w('later', 1000)]);
    expect(b.words().map((x) => x.text)).toEqual(['earlier', 'later']);
  });

  it('sorts out-of-order words', () => {
    const b = new TranscriptBuffer();
    b.applyFinal([w('b', 500), w('a', 100)]);
    expect(b.words().map((x) => x.text)).toEqual(['a', 'b']);
  });

  it('wordsSince keeps words starting at or after the time', () => {
    const b = new TranscriptBuffer();
    b.applyFinal([w('a', 0), w('b', 500), w('c', 1000)]);
    expect(b.wordsSince(500).map((x) => x.text)).toEqual(['b', 'c']);
    expect(b.wordsSince(1001)).toEqual([]);
  });

  it('recentText returns the last maxWords words', () => {
    const b = new TranscriptBuffer();
    b.applyFinal(Array.from({ length: 100 }, (_, i) => w(`w${i}`, i * 100)));
    expect(b.recentText().split(' ')).toHaveLength(60);
    expect(b.recentText(3)).toBe('w97 w98 w99');
  });

  it('caps stored final words at 3000', () => {
    const b = new TranscriptBuffer();
    b.applyFinal(Array.from({ length: 3200 }, (_, i) => w(`w${i}`, i * 100)));
    const all = b.words();
    expect(all).toHaveLength(3000);
    expect(all[0]?.text).toBe('w200');
  });

  it('caps a partial at 300 words, keeping the newest', () => {
    const b = new TranscriptBuffer();
    b.applyPartial(Array.from({ length: 1000 }, (_, i) => w(`w${i}`, i * 100)));
    expect(b.words()).toHaveLength(300);
    expect(b.words().at(-1)?.text).toBe('w999');
  });

  it('does not change when the caller mutates the array it passed in', () => {
    const b = new TranscriptBuffer();
    const input = [w('a', 0)];
    b.applyPartial(input);
    input.push(w('b', 100));
    expect(b.words()).toHaveLength(1);
  });

  describe('markedText', () => {
    const at = (text: string, startMs: number, endMs = startMs + 100): Word => ({
      text,
      startMs,
      endMs,
    });

    it('puts a pause mark where the speaker went quiet', () => {
      const b = new TranscriptBuffer();
      b.applyFinal([at('the', 0), at('place', 300), at('where', 2500), at('you', 2800)]);
      expect(b.markedText(10)).toBe('the place … where you');
    });

    it('marks 800 ms but not 700 ms', () => {
      const b = new TranscriptBuffer();
      b.applyFinal([at('a', 0), at('b', 800), at('c', 1600)]);
      // a ends 100, b starts 800: gap 700. b ends 900, c starts 1600: gap 700.
      expect(b.markedText(10)).toBe('a b c');
      const c = new TranscriptBuffer();
      c.applyFinal([at('a', 0), at('b', 900)]);
      expect(c.markedText(10)).toBe('a … b');
    });

    it('does not end with a mark, however long the speaker has been quiet', () => {
      const b = new TranscriptBuffer();
      b.applyFinal([at('the', 0), at('thing', 300)]);
      expect(b.markedText(10)).toBe('the thing');
    });

    it('keeps only the last words, and nothing for no words', () => {
      const b = new TranscriptBuffer();
      b.applyFinal([at('a', 0), at('b', 300), at('c', 600)]);
      expect(b.markedText(2)).toBe('b c');
      expect(new TranscriptBuffer().markedText(5)).toBe('');
    });
  });
});
