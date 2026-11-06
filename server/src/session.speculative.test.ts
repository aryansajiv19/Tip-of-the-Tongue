import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerEvent, Word } from './events.js';
import type { GuessResult, Guesser } from './guess/types.js';
import { createSession } from './session.js';

const T0 = 1_000_000;

// A guesser that answers after `ms`, and records calls and aborts.
function fakeGuesser(ms: number, words: string[] = ['pharmacy']) {
  const stats = { calls: 0, aborted: 0 };
  const guess: Guesser = (_input, signal) =>
    new Promise<GuessResult>((resolve) => {
      stats.calls++;
      const timer = setTimeout(
        () =>
          resolve({
            candidates: words.map((word) => ({ word, confidence: 0.9 })),
            abstain: false,
            latencyMs: ms,
          }),
        ms,
      );
      signal?.addEventListener('abort', () => {
        stats.aborted++;
        clearTimeout(timer);
        resolve({ candidates: [], abstain: true, latencyMs: 0, error: true });
      });
    });
  return { guess, stats };
}

function setup(guess: Guesser, speculateAfterMs: number | undefined = 300) {
  const events: (ServerEvent & { atMs: number })[] = [];
  const logs: Record<string, unknown>[] = [];
  const errors: unknown[] = [];
  const session = createSession((e) => events.push({ ...e, atMs: Date.now() }), {
    guess,
    pauseMs: 1500,
    minConfidence: 0.6,
    cooldownMs: 8000,
    acceptWindowMs: 10_000,
    moveOnWords: 6,
    ...(speculateAfterMs ? { speculateAfterMs } : {}),
    log: (info) => logs.push(info),
    onError: (err) => errors.push(err),
  });
  // Speaks words 300 ms apart and returns when the last one ended. By default they end now;
  // `after` puts them right after the end time of earlier words instead.
  const say = (text: string, after?: number) => {
    const parts = text.split(' ');
    const start = after === undefined ? Date.now() - parts.length * 300 : after + 200;
    const words: Word[] = parts.map((t, i) => ({
      text: t,
      startMs: start + i * 300,
      endMs: start + i * 300 + 100,
    }));
    session.handle({ type: 'transcript.final', words });
    return words.at(-1)?.endMs ?? 0;
  };
  const offered = () => events.find((e) => e.type === 'guess.offered');
  return { session, events, logs, errors, say, offered };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

// "to the" is an unfinished phrase, so it is confirmed after 1500 ms of silence.
const STALL = 'I need to go to the';

describe('speculative guessing', () => {
  it('offers at the confirmation threshold even with a slow guesser', async () => {
    const withSpec = setup(fakeGuesser(800).guess);
    const endMs = withSpec.say(STALL);
    await vi.advanceTimersByTimeAsync(4000);
    const fast = (withSpec.offered()?.atMs ?? 0) - endMs;
    withSpec.session.close();

    vi.setSystemTime(T0);
    const without = setup(fakeGuesser(800).guess, 0);
    const endMs2 = without.say(STALL);
    await vi.advanceTimersByTimeAsync(4000);
    const slow = (without.offered()?.atMs ?? 0) - endMs2;
    without.session.close();

    console.info(`stall to offer: ${slow} ms without speculation, ${fast} ms with`);
    // Confirmed after 1500 ms of silence, plus at most one 100 ms poll.
    expect(fast).toBeGreaterThanOrEqual(1500);
    expect(fast).toBeLessThanOrEqual(1700);
    // Without it the 800 ms call starts only at confirmation.
    expect(slow).toBeGreaterThanOrEqual(2300);
    expect(withSpec.logs.find((l) => 'stallToOfferMs' in l)?.stallToOfferMs).toBe(fast);
  });

  it('offers the moment a late result lands when the stall is already confirmed', async () => {
    const { session, say, offered } = setup(fakeGuesser(1800).guess);
    const endMs = say(STALL);
    await vi.advanceTimersByTimeAsync(1900);
    expect(offered()).toBeUndefined();
    await vi.advanceTimersByTimeAsync(600);
    // Started at ~300 ms, so it lands at ~2100 ms: not at 1500 + 1800.
    const at = (offered()?.atMs ?? 0) - endMs;
    expect(at).toBeGreaterThanOrEqual(2000);
    expect(at).toBeLessThanOrEqual(2300);
    session.close();
  });

  it('throws the result away and aborts when speech resumes', async () => {
    const g = fakeGuesser(800);
    const { session, say, events, logs } = setup(g.guess);
    const endMs = say(STALL);
    await vi.advanceTimersByTimeAsync(500);
    expect(g.stats.calls).toBe(1);
    say('shop on the corner and then we left.', endMs);
    await vi.advanceTimersByTimeAsync(4000);
    expect(g.stats.aborted).toBe(1);
    expect(events.map((e) => e.type)).not.toContain('guess.offered');
    expect(events.map((e) => e.type)).not.toContain('stuck.detected');
    expect(logs).toContainEqual({ speculated: 1, discarded: 1 });
    session.close();
  });

  it('a pause that is not a stall costs one call and no pop-up', async () => {
    const g = fakeGuesser(100);
    const { session, say, events } = setup(g.guess);
    const endMs = say('we shipped the');
    await vi.advanceTimersByTimeAsync(600);
    say('release on Tuesday and the customers liked it.', endMs);
    await vi.advanceTimersByTimeAsync(3000);
    expect(g.stats.calls).toBe(1);
    expect(events).toEqual([]);
    session.close();
  });

  it('starts one guess per stall', async () => {
    const g = fakeGuesser(200);
    const { session, say } = setup(g.guess);
    say(STALL);
    await vi.advanceTimersByTimeAsync(6000);
    expect(g.stats.calls).toBe(1);
    session.close();
  });

  it('does not guess early when speculation is off', async () => {
    const g = fakeGuesser(200);
    const { session, say } = setup(g.guess, 0);
    say(STALL);
    await vi.advanceTimersByTimeAsync(1000);
    expect(g.stats.calls).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(g.stats.calls).toBe(1);
    session.close();
  });

  it('still suppresses the offer if the user already said the word', async () => {
    const { session, say, events } = setup(fakeGuesser(500, ['knife']).guess);
    say('can you pass the the thing for cutting bread knife');
    await vi.advanceTimersByTimeAsync(4000);
    expect(events.map((e) => e.type)).toEqual(['stuck.detected']);
    session.close();
  });

  it('stays silent and survives a guesser that rejects', async () => {
    const guess: Guesser = () => Promise.reject(new Error('broke its contract'));
    const { session, say, events, errors } = setup(guess);
    say(STALL);
    await vi.advanceTimersByTimeAsync(4000);
    expect(events.map((e) => e.type)).toEqual(['stuck.detected']);
    expect(errors).toHaveLength(1);
    session.close();
  });

  it('stays silent when the guesser reports an error result', async () => {
    const guess: Guesser = async () => ({
      candidates: [],
      abstain: true,
      latencyMs: 5,
      error: true,
    });
    const { session, say, events } = setup(guess);
    say(STALL);
    await vi.advanceTimersByTimeAsync(4000);
    expect(events.map((e) => e.type)).toEqual(['stuck.detected']);
    session.close();
  });

  it('ignores a late result after the session is closed', async () => {
    const g = fakeGuesser(800);
    const { session, say, events } = setup(g.guess);
    say(STALL);
    await vi.advanceTimersByTimeAsync(500);
    session.close();
    await vi.advanceTimersByTimeAsync(4000);
    expect(events).toEqual([]);
    expect(g.stats.aborted).toBe(1);
  });
});
