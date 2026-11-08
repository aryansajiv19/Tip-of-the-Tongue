import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerEvent, Word } from './events.js';
import { mockGuesser } from './guess/mock.js';
import { createSession } from './session.js';

const T0 = 1_000_000;

function setup() {
  const events: ServerEvent[] = [];
  const session = createSession((e) => events.push(e), {
    guess: mockGuesser,
    pauseMs: 1500,
    minConfidence: 0.6,
    cooldownMs: 8000,
    acceptWindowMs: 10_000,
    moveOnWords: 6,
    speculateAfterMs: 300,
    now: () => Date.now(),
  });
  // One voice says a phrase, 300 ms per word, as one final result.
  const say = (speaker: number | undefined, text: string) => {
    const words: Word[] = text.split(' ').map((t, i) => {
      const at = Date.now() + i * 300;
      return {
        text: t,
        startMs: at,
        endMs: at + 250,
        ...(speaker !== undefined ? { speaker } : {}),
      };
    });
    vi.advanceTimersByTime(words.length * 300);
    session.handle({ type: 'transcript.final', words });
  };
  const offers = () => events.filter((e) => e.type === 'guess.offered').length;
  const stalls = () => events.filter((e) => e.type === 'stuck.detected').length;
  // The user talks (voice 0) for a while so the session learns whose voice it is.
  const introduce = () => {
    say(0, 'Hello everyone thanks for joining I am going to walk you through the plan');
    say(1, 'Sure go ahead');
    say(0, 'First the budget and then the timeline and then the next steps for the team');
    vi.advanceTimersByTime(20_000);
    say(0, 'Okay so that is the plan');
  };
  return { session, events, say, offers, stalls, introduce };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

const STALL = 'I need to go to the the place where you get medicine';

describe('who is speaking', () => {
  it('learns the user as the voice that talked most in the first 20 seconds', () => {
    const { session, introduce } = setup();
    introduce();
    expect(session.speaker()).toBe(0);
    session.close();
  });

  it('offers a word when the user stalls', async () => {
    const { session, say, offers, introduce } = setup();
    introduce();
    await vi.advanceTimersByTimeAsync(3000);
    const before = offers();
    say(0, STALL);
    await vi.advanceTimersByTimeAsync(2500);
    expect(offers()).toBe(before + 1);
    session.close();
  });

  it('stays silent when the other voice stalls', async () => {
    const { session, say, offers, stalls, introduce } = setup();
    introduce();
    await vi.advanceTimersByTimeAsync(3000);
    const before = { stalls: stalls(), offers: offers() };
    say(1, STALL);
    await vi.advanceTimersByTimeAsync(3000);
    expect(stalls()).toBe(before.stalls);
    expect(offers()).toBe(before.offers);
    session.close();
  });

  it('does not guess early for the other voice either', async () => {
    const guess = vi.fn(mockGuesser);
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
    const at = Date.now();
    const words: Word[] = ['one', 'two', 'three'].map((t, i) => ({
      text: t,
      startMs: at + i * 300,
      endMs: at + i * 300 + 250,
      speaker: 0,
    }));
    session.handle({ type: 'transcript.final', words });
    vi.advanceTimersByTime(21_000);
    const later = Date.now();
    session.handle({
      type: 'transcript.final',
      words: [{ text: 'the', startMs: later, endMs: later + 250, speaker: 1 }],
    });
    guess.mockClear();
    await vi.advanceTimersByTimeAsync(3000);
    expect(guess).not.toHaveBeenCalled();
    session.close();
  });

  it('takes the voice of the last words as the user when they ask by hand', async () => {
    const { session, say, offers } = setup();
    // The other voice talks most at first, so the session first picks voice 1 as the user.
    say(1, 'Welcome to the call today I will go through every item on the long agenda');
    say(0, 'Hi');
    vi.advanceTimersByTime(21_000);
    say(1, 'Right so that is item one');
    expect(session.speaker()).toBe(1);

    // Voice 0 stalls and presses Space.
    say(0, 'Can you pass the the thing for cutting bread');
    session.handle({ type: 'stuck.manual' });
    await vi.advanceTimersByTimeAsync(1500);
    expect(session.speaker()).toBe(0);
    expect(offers()).toBe(1);
    session.close();
  });

  it('works as before when the words carry no speaker label', async () => {
    const { session, say, offers } = setup();
    say(undefined, STALL);
    await vi.advanceTimersByTimeAsync(2500);
    expect(session.speaker()).toBeUndefined();
    expect(offers()).toBe(1);
    session.close();
  });
});
