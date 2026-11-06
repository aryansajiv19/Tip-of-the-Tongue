import { describe, expect, it } from 'vitest';
import type { StuckResult } from '../../server/src/stuck/detect.js';
import { sweep, toTimedWords } from './timeline.js';

describe('toTimedWords', () => {
  it('puts words 300 ms apart, 100 ms long', () => {
    expect(toTimedWords('a b c').map((w) => [w.startMs, w.endMs])).toEqual([
      [0, 100],
      [300, 400],
      [600, 700],
    ]);
  });
  it('leaves a 2000 ms gap after a word ending in "..."', () => {
    const w = toTimedWords('the... thing here');
    expect(w.map((x) => x.startMs)).toEqual([0, 2100, 2400]);
    expect(w.map((x) => x.endMs)).toEqual([100, 2200, 2500]);
  });
  it('handles a "..." in the middle of a token and repeated pauses', () => {
    expect(toTimedWords('a... b... c').map((w) => w.startMs)).toEqual([0, 2100, 4200]);
  });
  it('returns nothing for empty text', () => {
    expect(toTimedWords('  ')).toEqual([]);
  });
});

const stuck: StuckResult = { stuck: true, reason: 'pause', contextWindow: 'x' };

describe('sweep', () => {
  it('asks every 200 ms from the first word end to 2 s after the last word', () => {
    const words = toTimedWords('a b'); // last end 400
    const times: number[] = [];
    sweep(words, (_h, now) => {
      times.push(now);
      return { stuck: false };
    });
    expect(times[0]).toBe(100);
    expect(times.at(-1)).toBe(2300); // last word ends at 400, so the sweep stops by 2400
    expect(times.slice(1).every((t, i) => t - (times[i] ?? 0) === 200)).toBe(true);
  });
  it('only shows the detector words that have finished', () => {
    const seen: number[] = [];
    sweep(toTimedWords('a b c'), (heard) => {
      seen.push(heard.length);
      return { stuck: false };
    });
    expect(seen[0]).toBe(1);
    expect(seen.at(-1)).toBe(3);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
  });
  it('returns every trigger point, in order', () => {
    const t = sweep(toTimedWords('a b'), (_h, now) => (now >= 1500 ? stuck : { stuck: false }));
    expect(t.map((x) => x.nowMs)).toEqual([1500, 1700, 1900, 2100, 2300]);
    expect(t[0]?.heard).toHaveLength(2);
  });
  it('returns nothing when the detector stays quiet, or there are no words', () => {
    expect(sweep(toTimedWords('a b'), () => ({ stuck: false }))).toEqual([]);
    expect(sweep([], () => stuck)).toEqual([]);
  });
});
