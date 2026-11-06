import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerEvent, Word } from './events.js';
import type { Guesser } from './guess/index.js';
import { mockGuesser } from './guess/mock.js';
import { createSession } from './session.js';

const T0 = 1_000_000;

function setup(guess: Guesser = mockGuesser) {
  const events: ServerEvent[] = [];
  const session = createSession((e) => events.push(e), {
    guess,
    pauseMs: 1500,
    minConfidence: 0.6,
    cooldownMs: 8000,
    acceptWindowMs: 10_000,
    moveOnWords: 6,
    now: () => Date.now(),
  });
  // Speaks a phrase as one final utterance, 300 ms per word, starting now.
  const say = (text: string) => {
    const words: Word[] = text.split(' ').map((w, i) => {
      const at = Date.now() + i * 300;
      return { text: w, startMs: at, endMs: at + 250 };
    });
    vi.advanceTimersByTime(words.length * 300);
    session.handle({ type: 'transcript.final', words });
  };
  const types = () => events.map((e) => e.type);
  return { session, events, say, types };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

describe('session pipeline', () => {
  it('offers a word after a stall and accepts it when spoken', async () => {
    const { session, events, say, types } = setup();
    say('I need to go to the the place where you get medicine');
    await vi.advanceTimersByTimeAsync(2000);
    const offer = events.find((e) => e.type === 'guess.offered');
    expect(offer?.type === 'guess.offered' && offer.candidates[0]?.word).toBe('pharmacy');

    say('pharmacy');
    await vi.advanceTimersByTimeAsync(300);
    expect(types()).toContain('guess.accepted');
    session.close();
  });

  it('does not offer a word the user said just after the stall marker', async () => {
    const { session, say, types } = setup();
    say('can you pass the the thing for cutting bread knife');
    await vi.advanceTimersByTimeAsync(2000);
    expect(types()).toEqual(['stuck.detected']);
    session.close();
  });

  it('offers it when the word was not said', async () => {
    const { session, say, types } = setup();
    say('can you pass the the thing for cutting bread');
    await vi.advanceTimersByTimeAsync(2000);
    expect(types()).toContain('guess.offered');
    session.close();
  });

  it('stays silent on fluent speech', async () => {
    const { session, say, events } = setup();
    say('we shipped the new release on Tuesday and the customers liked it');
    await vi.advanceTimersByTimeAsync(5000);
    expect(events).toEqual([]);
    session.close();
  });

  it('does not offer when the user finds the word while the guess is running', async () => {
    let finish: () => void = () => undefined;
    const slow: Guesser = async (input) => {
      await new Promise<void>((resolve) => (finish = resolve));
      return mockGuesser(input);
    };
    const { session, say, types } = setup(slow);
    say('I need to go to the the place where you get medicine');
    await vi.advanceTimersByTimeAsync(2000);
    expect(types()).toEqual(['stuck.detected']);
    say('pharmacy');
    finish();
    await vi.advanceTimersByTimeAsync(500);
    expect(types()).not.toContain('guess.offered');
    session.close();
  });

  it('withdraws the offer when the user moves on without picking a word', async () => {
    const { session, say, types } = setup();
    say('I need to go to the the place where you get medicine');
    await vi.advanceTimersByTimeAsync(2000);
    say('anyway we can talk about that later on today');
    await vi.advanceTimersByTimeAsync(300);
    expect(types()).toContain('guess.withdrawn');
    session.close();
  });

  it('expires an offer nobody answers', async () => {
    const { session, say, types } = setup();
    say('I need to go to the the place where you get medicine');
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(10_500);
    expect(types()).toContain('guess.expired');
    session.close();
  });

  it('guesses once per stall, not on every poll', async () => {
    const guess = vi.fn(mockGuesser);
    const { session, say } = setup(guess);
    say('can you pass me the');
    await vi.advanceTimersByTimeAsync(6000);
    expect(guess).toHaveBeenCalledTimes(1);
    session.close();
  });

  it('sends nothing after close, even if a guess was in flight', async () => {
    let finish: () => void = () => undefined;
    const slow: Guesser = async (input) => {
      await new Promise<void>((resolve) => (finish = resolve));
      return mockGuesser(input);
    };
    const { session, say, types } = setup(slow);
    say('I need to go to the the place where you get medicine');
    await vi.advanceTimersByTimeAsync(2000);
    session.close();
    finish();
    await vi.advanceTimersByTimeAsync(500);
    expect(types()).toEqual(['stuck.detected']);
  });

  it('uses the meeting brief in the guess', async () => {
    const guess = vi.fn(mockGuesser);
    const { session, say } = setup(guess);
    session.handle({ type: 'session.brief', text: 'Q3 review with Northwind' });
    say('we need to sort out the');
    await vi.advanceTimersByTimeAsync(2000);
    expect(guess.mock.calls[0]?.[0].brief).toBe('Q3 review with Northwind');
    session.close();
  });
});
