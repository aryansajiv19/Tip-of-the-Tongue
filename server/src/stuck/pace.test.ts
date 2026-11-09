import { describe, expect, it } from 'vitest';
import type { Word } from '../events.js';
import { effectivePauseMs } from './pace.js';

// `n` words, `step` ms between starts, 100 ms long; after every `every`-th word a gap of `gapMs`
// (instead of the usual one) when given.
function speak(n: number, step: number, every = 0, gapMs = 0): Word[] {
  const words: Word[] = [];
  let at = 0;
  for (let i = 0; i < n; i++) {
    words.push({ text: `w${i}`, startMs: at, endMs: at + 100 });
    at += every > 0 && (i + 1) % every === 0 ? 100 + gapMs : step;
  }
  return words;
}

const BASE = 1500;

describe('effectivePauseMs', () => {
  it('uses the setting as it is until the speaker is known', () => {
    expect(effectivePauseMs(BASE, speak(20, 900))).toBe(BASE);
    expect(effectivePauseMs(BASE, speak(26, 900))).toBeGreaterThan(BASE);
    expect(effectivePauseMs(BASE, [])).toBe(BASE);
  });

  it('leaves a typical speaker alone, from the example conversations to a calm talker', () => {
    expect(effectivePauseMs(BASE, speak(80, 300))).toBe(BASE);
    expect(effectivePauseMs(BASE, speak(80, 400))).toBe(BASE);
    expect(effectivePauseMs(BASE, speak(80, 450))).toBe(BASE);
  });

  it('waits longer for a slow speaker, so their ordinary gaps do not start a guess', () => {
    const slow = effectivePauseMs(BASE, speak(80, 700));
    expect(slow).toBeGreaterThan(2000);
    expect(slow).toBeLessThanOrEqual(BASE * 2.5);
    // A gap of 1.5 s between slow words is ordinary for them, a stall of 3.5 s is not.
    expect(slow).toBeGreaterThan(1600);
    expect(slow).toBeLessThan(3500);
  });

  it('waits less for a fast speaker, never under 700 ms', () => {
    const fast = effectivePauseMs(BASE, speak(80, 150));
    expect(fast).toBeLessThan(BASE);
    expect(fast).toBeGreaterThanOrEqual(700);
    expect(effectivePauseMs(900, speak(80, 100))).toBe(700);
  });

  it('is capped at 6 s however slow they are', () => {
    expect(effectivePauseMs(4000, speak(80, 2500))).toBe(6000);
  });

  it('is the setting times the rate, so calm stays calmer than eager', () => {
    const calm = effectivePauseMs(2500, speak(80, 700));
    const eager = effectivePauseMs(900, speak(80, 700));
    expect(calm).toBeGreaterThan(eager);
  });

  it('is not pulled up by a speaker who stalls often (a 2 s stall every 20 words)', () => {
    const staller = speak(100, 300, 20, 2000);
    expect(effectivePauseMs(BASE, staller)).toBe(BASE);
    // and still 1500 with one every 14 words, below the habit limit of 1 in 12
    expect(effectivePauseMs(BASE, speak(112, 300, 14, 2000))).toBe(BASE);
  });

  it('learns a habit of long breathing gaps, but keeps a real stall above it', () => {
    // A 1.7 s gap after every 6th word
    const breathy = speak(90, 400, 6, 1700);
    const p = effectivePauseMs(BASE, breathy);
    expect(p).toBeGreaterThan(1700);
    expect(p).toBeLessThan(3000);
  });

  it('ignores gaps over 4 s (turns and long silences) when judging the rate', () => {
    const words = speak(80, 300);
    // a 20 s silence in the middle
    const gapped = words.map((w, i) =>
      i >= 40 ? { ...w, startMs: w.startMs + 20_000, endMs: w.endMs + 20_000 } : w,
    );
    expect(effectivePauseMs(BASE, gapped)).toBe(BASE);
  });

  it('does not depend on the order the words arrive in', () => {
    const words = speak(80, 700);
    expect(effectivePauseMs(BASE, [...words].reverse())).toBe(effectivePauseMs(BASE, words));
  });
});
