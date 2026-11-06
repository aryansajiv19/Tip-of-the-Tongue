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

  it('caps stored final words at 500', () => {
    const b = new TranscriptBuffer();
    b.applyFinal(Array.from({ length: 700 }, (_, i) => w(`w${i}`, i * 100)));
    const all = b.words();
    expect(all).toHaveLength(500);
    expect(all[0]?.text).toBe('w200');
  });

  it('does not change when the caller mutates the array it passed in', () => {
    const b = new TranscriptBuffer();
    const input = [w('a', 0)];
    b.applyPartial(input);
    input.push(w('b', 100));
    expect(b.words()).toHaveLength(1);
  });
});
