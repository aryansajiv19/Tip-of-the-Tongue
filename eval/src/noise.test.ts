import { describe, expect, it } from 'vitest';
import type { Word } from '../../server/src/events.js';
import { degradeWords, hashSeed } from './noise.js';
import { toTimedWords } from './timeline.js';

const text = (ws: Word[]): string[] => ws.map((w) => w.text);
const many = 'the thing where you go to see the red week list'.split(' ');
const asWords = (ts: string[]): Word[] =>
  ts.map((t, i) => ({ text: t, startMs: i * 300, endMs: i * 300 + 100 }));

describe('degradeWords', () => {
  it('drops fillers, lowercases and strips punctuation', () => {
    const w = toTimedWords('Um, the... Uh, thing is good!');
    const out = degradeWords(w, [], 0).words;
    expect(text(out).join(' ')).not.toMatch(/\b(um|uh)\b/);
    expect(text(out).every((t) => t === t.toLowerCase() && !/[.,!]/.test(t))).toBe(true);
  });

  it('keeps timing, so pauses survive', () => {
    const w = toTimedWords('the... thing');
    const out = degradeWords(w, [], 0).words;
    expect(out.map((x) => x.startMs)).toEqual([0, 2100]);
    expect(out.map((x) => x.endMs)).toEqual([100, 2200]);
  });

  it('is deterministic for a seed and differs across seeds', () => {
    const w = asWords(many.concat(many, many));
    const a = degradeWords(w, [], 7);
    expect(degradeWords(w, [], 7)).toEqual(a);
    const seeds = [1, 2, 3, 4, 5].map((s) => text(degradeWords(w, [], s).words).join(' '));
    expect(new Set(seeds).size).toBeGreaterThan(1);
  });

  it('swaps some words with table entries and counts them', () => {
    const w = asWords(many.concat(many, many, many));
    const r = degradeWords(w, [], 3);
    expect(r.swapped).toBeGreaterThan(0);
    expect(r.swapped).toBeLessThan(r.eligible);
    expect(r.words).toHaveLength(w.length);
  });

  it('never changes or drops a protected word, whatever the seed', () => {
    const w = asWords(['the', 'watch', 'red', 'uh', 'ER', "Chemist's", 'thing', 'bread', 'knife']);
    for (let seed = 0; seed < 200; seed++) {
      const out = text(
        degradeWords(w, ['watch', 'chemist', "chemist's", 'bread knife'], seed).words,
      );
      expect(out).toContain('watch');
      expect(out).toContain("chemist's");
      expect(out).toContain('bread');
      expect(out).toContain('knife');
    }
  });

  it('protects every word of a multi-word target', () => {
    const w = asWords(['the', 'traffic', 'lights', 'by', 'one']);
    for (let seed = 0; seed < 100; seed++) {
      const out = text(degradeWords(w, ['traffic lights'], seed).words);
      expect(out.slice(1, 3)).toEqual(['traffic', 'lights']);
    }
  });

  it('does not count protected words or fillers as eligible', () => {
    const r = degradeWords(asWords(['um', 'watch', 'the']), ['watch'], 0);
    expect(r.eligible).toBe(1);
  });

  it('handles no words', () => {
    expect(degradeWords([], [], 0)).toEqual({ words: [], swapped: 0, eligible: 0 });
  });
});

describe('hashSeed', () => {
  it('is stable per id and differs between ids', () => {
    expect(hashSeed(1, 'c01')).toBe(hashSeed(1, 'c01'));
    expect(hashSeed(1, 'c01')).not.toBe(hashSeed(1, 'c02'));
    expect(hashSeed(1, 'c01')).not.toBe(hashSeed(2, 'c01'));
  });
});
