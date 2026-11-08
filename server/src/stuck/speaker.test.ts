import { describe, expect, it } from 'vitest';
import type { Word } from '../events.js';
import { speakerOfFirstUtterance } from './speaker.js';

const w = (speaker?: number): Word => ({
  text: 'x',
  startMs: 0,
  endMs: 100,
  ...(speaker !== undefined ? { speaker } : {}),
});

describe('speakerOfFirstUtterance', () => {
  it('is the voice that said the words', () => {
    expect(speakerOfFirstUtterance([w(1), w(1), w(1)])).toBe(1);
  });

  it('skips a single word, which says too little and is often mislabelled', () => {
    expect(speakerOfFirstUtterance([w(1)])).toBeUndefined();
    expect(speakerOfFirstUtterance([])).toBeUndefined();
  });

  it('takes the voice with most of the words when the first word differs', () => {
    expect(speakerOfFirstUtterance([w(0), w(1), w(1), w(1)])).toBe(1);
  });

  it('is undefined when no word is labelled, and ignores unlabelled ones', () => {
    expect(speakerOfFirstUtterance([w(), w()])).toBeUndefined();
    expect(speakerOfFirstUtterance([w(), w(2), w()])).toBe(2);
  });

  it('gives a tie to the lower number', () => {
    expect(speakerOfFirstUtterance([w(1), w(0)])).toBe(0);
  });
});
