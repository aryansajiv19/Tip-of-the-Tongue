import { describe, expect, it } from 'vitest';
import {
  READING_MS,
  healthMessage,
  initialHealth,
  inputHealth,
  noteLevel,
  noteWords,
  type Health,
  type InputHealth,
} from './inputHealth';

const T0 = 1_000_000;

// Plays `seconds` of microphone readings, one per READING_MS, and word arrivals every
// `wordsEveryS` seconds (0: none). Returns what the check says at the end.
function play(
  h: Health,
  from: number,
  seconds: number,
  level: number | ((tMs: number) => number),
  wordsEveryS = 0,
): { h: Health; at: number } {
  let state = h;
  let t = from;
  const end = from + seconds * 1000;
  let nextWords = from + wordsEveryS * 1000;
  for (; t < end; t += READING_MS) {
    state = noteLevel(state, typeof level === 'number' ? level : level(t), t);
    if (wordsEveryS > 0 && t >= nextWords) {
      state = noteWords(state, t);
      nextWords += wordsEveryS * 1000;
    }
  }
  return { h: state, at: t };
}

const verdict = (r: { h: Health; at: number }): InputHealth => inputHealth(r.h, r.at);

describe('a microphone muted at the OS', () => {
  it('is silent after ten seconds of exact zeros, not before', () => {
    expect(verdict(play(initialHealth, T0, 9.5, 0))).toBe('ok');
    expect(verdict(play(initialHealth, T0, 10.5, 0))).toBe('silent');
  });

  it('is not fooled by one breath of noise: the count starts again', () => {
    const quiet = play(initialHealth, T0, 9, 0);
    const blip = noteLevel(quiet.h, 0.003, quiet.at);
    expect(verdict(play(blip, quiet.at + READING_MS, 9, 0))).toBe('ok');
  });

  it('is not silent in a very quiet real room (noise well above zero)', () => {
    expect(verdict(play(initialHealth, T0, 60, 0.002))).toBe('ok');
  });

  it('recovers the moment sound returns', () => {
    const muted = play(initialHealth, T0, 12, 0);
    expect(verdict(muted)).toBe('silent');
    expect(verdict(play(muted.h, muted.at, 0.2, 0.05))).toBe('ok');
  });
});

describe('quiet speech (hypophonia)', () => {
  // Quiet talking: peaks around 0.015, a word arriving every 1.5 s.
  const quietTalk = (t: number) => (Math.floor(t / 300) % 2 === 0 ? 0.015 : 0.004);

  it('is faint once words keep arriving at a level that never reaches normal speech', () => {
    expect(verdict(play(initialHealth, T0, 14, quietTalk, 1.5))).toBe('faint');
  });

  it('is not flagged in the first seconds, before there is enough to judge', () => {
    expect(verdict(play(initialHealth, T0, 4, quietTalk, 1))).toBe('ok');
  });

  it('is fine at normal speaking level with the same words', () => {
    const normal = (t: number) => (Math.floor(t / 300) % 2 === 0 ? 0.09 : 0.02);
    expect(verdict(play(initialHealth, T0, 20, normal, 1.5))).toBe('ok');
  });

  it('is fine for a quiet room with no words: nobody is speaking', () => {
    expect(verdict(play(initialHealth, T0, 30, 0.01))).toBe('ok');
  });

  it('clears within the window once the person speaks up', () => {
    const faint = play(initialHealth, T0, 14, quietTalk, 1.5);
    expect(verdict(faint)).toBe('faint');
    const loud = play(faint.h, faint.at, 12, 0.08, 1.5);
    expect(verdict(loud)).toBe('ok');
  });

  it('one loud cough in a quiet stretch is enough to say the microphone works', () => {
    const cough = (t: number) => (Math.abs(t - (T0 + 5000)) < 100 ? 0.2 : 0.012);
    expect(verdict(play(initialHealth, T0, 14, cough, 1.5))).toBe('ok');
  });
});

describe('sound with no words', () => {
  it('is unheard after sustained loud sound that produces no words', () => {
    expect(verdict(play(initialHealth, T0, 14, 0.12))).toBe('unheard');
  });

  it('is not flagged for a short bang or a cough', () => {
    const bang = (t: number) => (t - T0 < 1500 ? 0.3 : 0.003);
    expect(verdict(play(initialHealth, T0, 20, bang))).toBe('ok');
  });

  it('is fine when the same loud sound produces words', () => {
    expect(verdict(play(initialHealth, T0, 20, 0.12, 1))).toBe('ok');
  });

  it('is judged on the last ten seconds only, so it clears after the noise stops', () => {
    const noise = play(initialHealth, T0, 14, 0.12);
    expect(verdict(noise)).toBe('unheard');
    expect(verdict(play(noise.h, noise.at, 11, 0.003))).toBe('ok');
  });
});

describe('robustness of the state itself', () => {
  it('ignores NaN and Infinity levels and keeps a bounded number of buckets over two hours', () => {
    let h = initialHealth;
    for (let t = T0; t < T0 + 2 * 3600_000; t += 1000) {
      h = noteLevel(h, t % 7000 === 0 ? NaN : 0.05, t);
      h = noteWords(h, t);
    }
    expect(h.buckets.length).toBeLessThanOrEqual(10);
    expect(inputHealth(h, T0 + 2 * 3600_000)).toBe('ok');
  });

  it('a gap in readings (Mac asleep) does not carry old seconds into the verdict', () => {
    const before = play(initialHealth, T0, 14, 0.12);
    expect(verdict(before)).toBe('unheard');
    const woke = noteLevel(before.h, 0.05, before.at + 8 * 3600_000);
    expect(inputHealth(woke, before.at + 8 * 3600_000)).toBe('ok');
  });

  it('has a message for every problem and none for ok', () => {
    expect(healthMessage('ok')).toBe('');
    for (const h of ['silent', 'faint', 'unheard'] as const) {
      expect(healthMessage(h).length).toBeGreaterThan(10);
    }
  });
});
