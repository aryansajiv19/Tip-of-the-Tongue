import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerEvent, Word } from './events.js';
import type { Guesser } from './guess/types.js';
import { createSession } from './session.js';

const T0 = 1_000_000;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

const reply: Guesser = async () => ({
  candidates: [{ word: 'spoon', confidence: 0.9 }],
  abstain: false,
  latencyMs: 5,
});

function setup(guess: Guesser = reply) {
  const events: ServerEvent[] = [];
  const session = createSession((e) => events.push(e), {
    guess,
    pauseMs: 1500,
    minConfidence: 0.6,
    cooldownMs: 8000,
    acceptWindowMs: 10_000,
    moveOnWords: 6,
    speculateAfterMs: 300,
    now: () => Date.now(),
  });
  // Speech that ends now, `step` ms from one word's start to the next's.
  const talk = (text: string, step: number, from: 'now' | 'ending-now' = 'ending-now') => {
    const tokens = text.split(/\s+/).filter(Boolean);
    // Said just now: the last word ends at this moment.
    const start = from === 'now' ? Date.now() : Date.now() - (tokens.length - 1) * step - 100;
    const words: Word[] = tokens.map((t, i) => ({
      text: t,
      startMs: start + i * step,
      endMs: start + i * step + 100,
    }));
    session.handle({ type: 'transcript.final', words });
  };
  const stalls = () => events.filter((e) => e.type === 'stuck.detected').length;
  const offers = () => events.filter((e) => e.type === 'guess.offered').length;
  return { session, events, talk, stalls, offers };
}

const filler = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

describe('pace', () => {
  it('a slow speaker pausing 1.8 s between phrases is not stalling, 2.5 s after the last word is', async () => {
    const { session, talk, stalls } = setup();
    talk(filler(60), 700);
    await vi.advanceTimersByTimeAsync(1800);
    talk('and then the', 700, 'now');
    expect(stalls()).toBe(0);
    await vi.advanceTimersByTimeAsync(4000);
    expect(stalls()).toBe(1);
    session.close();
  });

  it('a fast speaker is caught at a 1.1 s pause, which the plain 1.5 s setting would miss', async () => {
    const { session, talk, stalls } = setup();
    talk(filler(60), 150);
    talk('I need the', 150, 'now');
    // the phrase takes 400 ms to say, then 1.1 s of silence
    await vi.advanceTimersByTimeAsync(400 + 1100);
    expect(stalls()).toBe(1);
    session.close();
  });

  it('a typical speaker keeps the setting', async () => {
    const { session, talk, stalls } = setup();
    talk(filler(60), 350);
    talk('I need the', 350, 'now');
    await vi.advanceTimersByTimeAsync(800 + 1100);
    expect(stalls()).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(stalls()).toBe(1);
    session.close();
  });

  it('shows the pause it settled on in the debug stream', async () => {
    const { session, talk, events } = setup();
    session.handle({ type: 'session.debug', on: true });
    talk(filler(60), 700);
    await vi.advanceTimersByTimeAsync(2500);
    const pace = events.flatMap((e) =>
      e.type === 'debug' && e.info.kind === 'pace' ? [e.info.pauseMs] : [],
    );
    expect(pace.length).toBeGreaterThan(0);
    expect(pace.at(-1)).toBeGreaterThan(2000);
    session.close();
  });
});

describe('stuttering', () => {
  it('no pop-up after blocks on begun words, however long the silence', async () => {
    const { session, talk, stalls, offers } = setup();
    talk('I would like a c- c- c-', 300);
    await vi.advanceTimersByTimeAsync(6000);
    talk('coffee and also a b- b-', 300);
    await vi.advanceTimersByTimeAsync(6000);
    expect(stalls()).toBe(0);
    expect(offers()).toBe(0);
    session.close();
  });

  it('a typical speaker who says "the the" twice within 20 s still gets a pause-triggered offer', async () => {
    const { session, talk, offers } = setup();
    talk('I went to the the shop and I looked for the the', 300);
    await vi.advanceTimersByTimeAsync(2500);
    expect(offers()).toBe(1);
    session.close();
  });
});

describe('self-corrections', () => {
  it('tells the guesser about the word taken back, and never offers it', async () => {
    const seen: (string[] | undefined)[] = [];
    const guess: Guesser = async (input) => {
      seen.push(input.rejected);
      return {
        candidates: [
          { word: 'fork', confidence: 0.95 },
          { word: 'spoon', confidence: 0.7 },
        ],
        abstain: false,
        latencyMs: 5,
      };
    };
    const { session, events, talk } = setup(guess);
    talk('pass me the fork no the', 300);
    await vi.advanceTimersByTimeAsync(2500);
    expect(seen.some((r) => r?.includes('fork'))).toBe(true);
    const offered = events.find((e) => e.type === 'guess.offered');
    expect(offered?.type === 'guess.offered' && offered.candidates.map((c) => c.word)).toEqual([
      'spoon',
    ]);
    session.close();
  });
});
