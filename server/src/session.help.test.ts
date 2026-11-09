import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientEvent, ServerEvent, Word } from './events.js';
import { ClientEventSchema } from './events.js';
import type { GuessResult, Guesser } from './guess/types.js';
import { createSession } from './session.js';

// Always suggests "pharmacy", so only the trigger decides whether there is an offer.
const answer: GuessResult = {
  candidates: [{ word: 'pharmacy', confidence: 0.9 }],
  abstain: false,
  latencyMs: 0,
};
const guesser: Guesser = () => Promise.resolve(answer);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => vi.useRealTimers());

function setup(speculateAfterMs = 0) {
  const events: ServerEvent[] = [];
  const session = createSession((e) => events.push(e), {
    guess: guesser,
    pauseMs: 1500,
    minConfidence: 0.6,
    cooldownMs: 8000,
    acceptWindowMs: 10_000,
    moveOnWords: 6,
    now: () => Date.now(),
    speculateAfterMs,
  });
  const say = (text: string) => {
    const words: Word[] = text.split(' ').map((w, i) => ({
      text: w,
      startMs: Date.now() + i * 300,
      endMs: Date.now() + i * 300 + 250,
    }));
    vi.advanceTimersByTime(words.length * 300);
    session.handle({ type: 'transcript.final', words });
  };
  const help = (level: 'ask' | 'sound' | 'word') => session.handle({ type: 'session.help', level });
  const offers = () => events.filter((e) => e.type === 'guess.offered');
  const stuck = () => events.filter((e) => e.type === 'stuck.detected');
  return { session, say, help, offers, stuck, events };
}

// A hesitation after "the" with nothing else: only the pause gives it away.
const PAUSE = 'I need to go to the';
const CUE = 'I need to go to the what is it called';

describe('help level "only when I ask"', () => {
  it('does not start anything after a plain pause', async () => {
    const { session, say, help, offers, stuck } = setup();
    help('ask');
    say(PAUSE);
    await vi.advanceTimersByTimeAsync(5000);
    expect(stuck()).toEqual([]);
    expect(offers()).toEqual([]);
    session.close();
  });

  it('does not even guess early while it waits', async () => {
    const guess = vi.fn(guesser);
    const events: ServerEvent[] = [];
    const session = createSession((e) => events.push(e), {
      guess,
      pauseMs: 1500,
      minConfidence: 0.6,
      cooldownMs: 8000,
      acceptWindowMs: 10_000,
      moveOnWords: 6,
      now: () => Date.now(),
      speculateAfterMs: 300,
    });
    session.handle({ type: 'session.help', level: 'ask' });
    const words: Word[] = PAUSE.split(' ').map((w, i) => ({
      text: w,
      startMs: Date.now() + i * 300,
      endMs: Date.now() + i * 300 + 250,
    }));
    vi.advanceTimersByTime(words.length * 300);
    session.handle({ type: 'transcript.final', words });
    await vi.advanceTimersByTimeAsync(5000);
    expect(guess).not.toHaveBeenCalled();
    session.close();
  });

  it('still answers the manual key', async () => {
    const { session, say, help, offers } = setup();
    help('ask');
    say(PAUSE);
    session.handle({ type: 'stuck.manual' });
    await vi.advanceTimersByTimeAsync(500);
    expect(offers()).toHaveLength(1);
    session.close();
  });

  it('still answers a spoken cue such as "what is it called"', async () => {
    const { session, say, help, offers, stuck } = setup();
    help('ask');
    say(CUE);
    await vi.advanceTimersByTimeAsync(3000);
    expect(stuck().map((e) => e.type === 'stuck.detected' && e.reason)).toEqual(['filler']);
    expect(offers()).toHaveLength(1);
    session.close();
  });

  it('can be switched off again: a pause then starts a guess', async () => {
    const { session, say, help, offers } = setup();
    help('ask');
    help('word');
    say(PAUSE);
    await vi.advanceTimersByTimeAsync(3000);
    expect(offers()).toHaveLength(1);
    session.close();
  });

  it('treats "first sound" like "whole word": the page decides what to show', async () => {
    const { session, say, help, offers } = setup();
    help('sound');
    say(PAUSE);
    await vi.advanceTimersByTimeAsync(3000);
    const offer = offers()[0];
    expect(offer?.type === 'guess.offered' && offer.candidates[0]?.word).toBe('pharmacy');
    session.close();
  });

  it('is not lost by a new conversation', async () => {
    const { session, say, help, offers } = setup();
    help('ask');
    session.handle({ type: 'session.reset' });
    say(PAUSE);
    await vi.advanceTimersByTimeAsync(5000);
    expect(offers()).toEqual([]);
    session.close();
  });
});

describe('session.help in the event schema', () => {
  const parse = (v: unknown) => ClientEventSchema.safeParse(v).success;
  const event = (level: unknown): ClientEvent | unknown => ({ type: 'session.help', level });

  it('takes ask, sound or word and nothing else', () => {
    for (const level of ['ask', 'sound', 'word']) expect(parse(event(level))).toBe(true);
    for (const level of ['', 'off', 'ASK', 'words', 1, null, undefined, {}, ['ask']]) {
      expect(parse(event(level))).toBe(false);
    }
    expect(parse({ type: 'session.help' })).toBe(false);
  });
});
