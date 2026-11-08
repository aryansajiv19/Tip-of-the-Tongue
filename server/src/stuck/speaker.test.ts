import { describe, expect, it } from 'vitest';
import type { Word } from '../events.js';
import { IDENTIFY_WINDOW_MS, loudestSpeaker } from './speaker.js';

const w = (startMs: number, speaker?: number): Word => ({
  text: 'x',
  startMs,
  endMs: startMs + 100,
  ...(speaker !== undefined ? { speaker } : {}),
});
const run = (n: number, speaker: number, from = 0) =>
  Array.from({ length: n }, (_, i) => w(from + i * 300, speaker));

describe('loudestSpeaker', () => {
  it('is undefined with no words or no labels', () => {
    expect(loudestSpeaker([], 99_999)).toBeUndefined();
    expect(loudestSpeaker([w(0), w(300)], 99_999)).toBeUndefined();
  });

  it('is undefined until 20 seconds of labelled speech have passed', () => {
    const words = [...run(5, 1), ...run(2, 0, 2000)];
    expect(loudestSpeaker(words, IDENTIFY_WINDOW_MS - 1)).toBeUndefined();
    expect(loudestSpeaker(words, IDENTIFY_WINDOW_MS)).toBe(1);
  });

  it('picks the voice with the most words in the first 20 seconds only', () => {
    // 0 speaks 3 words early; 1 speaks 10 words, but they start after the window.
    const words = [...run(3, 0), ...run(10, 1, IDENTIFY_WINDOW_MS)];
    expect(loudestSpeaker(words, 60_000)).toBe(0);
  });

  it('measures the window from the first labelled word, not from time zero', () => {
    const words = [w(100_000), ...run(4, 2, 105_000), ...run(1, 0, 110_000)];
    expect(loudestSpeaker(words, 126_000)).toBe(2);
  });

  it('ignores unlabelled words and gives a tie to the lower number', () => {
    const words = [w(0), w(300), w(600, 1), w(900, 0)];
    expect(loudestSpeaker(words, 30_000)).toBe(0);
  });
});
