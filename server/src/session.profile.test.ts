import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Word } from './events.js';
import type { GuessInput, Guesser } from './guess/types.js';
import { mockGuesser } from './guess/mock.js';
import { ProfileSchema } from './guess/profile.js';
import { createSession } from './session.js';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => vi.useRealTimers());

function setup(fileProfile?: ReturnType<typeof ProfileSchema.parse>) {
  const seen: GuessInput[] = [];
  const guess: Guesser = (input, signal) => {
    seen.push(input);
    return mockGuesser(input, signal);
  };
  const onKeytermsChange = vi.fn();
  const session = createSession(() => undefined, {
    guess,
    pauseMs: 1500,
    minConfidence: 0.6,
    cooldownMs: 8000,
    acceptWindowMs: 10_000,
    moveOnWords: 6,
    now: () => Date.now(),
    onKeytermsChange,
    ...(fileProfile ? { profile: fileProfile } : {}),
  });
  const stall = async () => {
    const words: Word[] = 'I need to go to the the place where you get medicine'
      .split(' ')
      .map((w, i) => ({
        text: w,
        startMs: Date.now() + i * 300,
        endMs: Date.now() + i * 300 + 250,
      }));
    vi.advanceTimersByTime(words.length * 300);
    session.handle({ type: 'transcript.final', words });
    await vi.advanceTimersByTimeAsync(2000);
  };
  return { session, seen, stall, onKeytermsChange };
}

describe('session.profile', () => {
  it('gives the guesser the file profile plus the page profile', async () => {
    const { session, seen, stall } = setup(
      ProfileSchema.parse({
        name: 'Alex',
        pets: { dog: 'Biscuit' },
        frequentlyLostWords: ['kettle'],
      }),
    );
    session.handle({
      type: 'session.profile',
      name: 'Dana',
      role: 'product lead',
      words: ['Northwind'],
      remembered: ['SOC 2', 'kettle'],
    });
    await stall();
    const profile = seen.at(-1)?.profile;
    expect(profile?.name).toBe('Dana');
    expect(profile?.role).toBe('product lead');
    expect(profile?.pets).toEqual({ dog: 'Biscuit' });
    expect(profile?.frequentlyLostWords).toEqual(['kettle', 'Northwind', 'SOC 2']);
    session.close();
  });

  it('works without a file profile, and without any profile it sends none', async () => {
    const empty = setup();
    await empty.stall();
    expect(empty.seen.at(-1)?.profile).toBeUndefined();
    empty.session.close();

    const ui = setup();
    ui.session.handle({ type: 'session.profile', words: ['Northwind'], remembered: [] });
    await ui.stall();
    expect(ui.seen.at(-1)?.profile?.frequentlyLostWords).toEqual(['Northwind']);
    ui.session.close();
  });

  it('a new profile replaces the old one, and an empty one clears it', async () => {
    const { session, seen, stall } = setup();
    session.handle({ type: 'session.profile', words: ['Northwind'], remembered: ['Biscuit'] });
    session.handle({ type: 'session.profile', words: [], remembered: [] });
    await stall();
    expect(seen.at(-1)?.profile).toBeUndefined();
    session.close();
  });

  it('puts the words into the speech recogniser terms, and tells it when they change', () => {
    const { session, onKeytermsChange } = setup();
    session.handle({ type: 'session.profile', words: ['Northwind'], remembered: ['Biscuit'] });
    expect(onKeytermsChange).toHaveBeenCalledTimes(1);
    expect(session.keyterms()).toEqual(['Northwind', 'Biscuit']);
    session.handle({ type: 'session.profile', words: ['Northwind'], remembered: ['Biscuit'] });
    expect(onKeytermsChange).toHaveBeenCalledTimes(1);
    session.handle({ type: 'session.profile', words: [], remembered: [] });
    expect(onKeytermsChange).toHaveBeenCalledTimes(2);
    session.close();
  });

  it('stays through a new conversation', async () => {
    const { session, seen, stall } = setup();
    session.handle({ type: 'session.profile', words: ['Northwind'], remembered: [] });
    session.handle({ type: 'session.reset' });
    await stall();
    expect(seen.at(-1)?.profile?.frequentlyLostWords).toEqual(['Northwind']);
    session.close();
  });
});
