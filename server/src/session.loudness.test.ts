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
  // A voice says `count` words at a microphone level (RMS), 300 ms per word, and the page reports
  // that level for the time the words were said (a chunk before the server sees them).
  const say = (speaker: number, count: number, level: number | undefined) => {
    const start = Date.now();
    const words: Word[] = Array.from({ length: count }, (_, i) => ({
      text: `w${i}`,
      startMs: start + i * 300,
      endMs: start + i * 300 + 250,
      speaker,
    }));
    if (level !== undefined) {
      const readings = Math.ceil((count * 300) / 50) + 4;
      for (let at = 0; at < readings; at += 40) {
        session.handle({
          type: 'voice.level',
          atMs: start - 100 + at * 50,
          levels: Array.from({ length: Math.min(40, readings - at) }, () => level),
        });
      }
    }
    vi.advanceTimersByTime(count * 300 + 200);
    session.handle({ type: 'transcript.final', words });
  };
  return { session, events, say };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

const LOUD = 0.2;
const QUIET = 0.02; // 20 dB below

describe('the user is the loudest voice at the microphone', () => {
  it('takes the loud voice for the user even when the others spoke first', () => {
    const { session, say } = setup();
    say(1, 10, QUIET);
    expect(session.speaker()).toBe(1); // a first guess, from the first words
    say(0, 8, LOUD);
    expect(session.speaker()).toBe(0);
    session.close();
  });

  it('does nothing without level readings', () => {
    const { session, say } = setup();
    say(1, 10, undefined);
    say(0, 20, undefined);
    expect(session.speaker()).toBe(1);
    session.close();
  });

  it('keeps the pick when a quieter voice joins', () => {
    const { session, say } = setup();
    say(0, 10, LOUD);
    say(1, 20, QUIET);
    expect(session.speaker()).toBe(0);
    session.close();
  });

  it('leaves what the user chose by hand alone', () => {
    const { session, say } = setup();
    say(0, 10, LOUD);
    say(1, 3, QUIET);
    session.handle({ type: 'speaker.mine' });
    expect(session.speaker()).toBe(1);
    say(0, 30, LOUD);
    expect(session.speaker()).toBe(1);
    session.close();
  });
});

describe('how many voices have been heard', () => {
  const counts = (events: ServerEvent[]) =>
    events.flatMap((e) => (e.type === 'speaker.count' ? [e.n] : []));

  it('reports a second voice once it has said three words, and zero after a new conversation', () => {
    const { session, events, say } = setup();
    say(0, 10, undefined);
    say(1, 2, undefined);
    expect(counts(events)).toEqual([1]);
    say(1, 3, undefined);
    expect(counts(events)).toEqual([1, 2]);
    session.handle({ type: 'session.reset' });
    expect(counts(events)).toEqual([1, 2, 0]);
    session.close();
  });
});

describe('what the others say does not decide who the user is', () => {
  it('does not take the other person\'s "what\'s the word" for the user asking', () => {
    const { session, events, say } = setup();
    say(0, 10, LOUD);
    say(1, 10, QUIET);
    const words = "did you get the what's the word".split(' ');
    const start = Date.now();
    vi.advanceTimersByTime(3000);
    session.handle({
      type: 'transcript.final',
      words: words.map((text, i) => ({
        text,
        startMs: start + i * 300,
        endMs: start + i * 300 + 250,
        speaker: 1,
      })),
    });
    expect(events.some((e) => e.type === 'stuck.detected' && e.reason === 'manual')).toBe(false);
    expect(session.speaker()).toBe(0);
    session.close();
  });

  it('corrects a pick made when only the others had spoken, once the user is heard louder', () => {
    const { session, say } = setup();
    say(1, 10, QUIET);
    say(2, 10, QUIET * 2); // 6 dB louder than voice 1: the loudest so far, but not the user
    expect(session.speaker()).toBe(2);
    say(0, 10, LOUD);
    expect(session.speaker()).toBe(0);
    session.close();
  });
});
