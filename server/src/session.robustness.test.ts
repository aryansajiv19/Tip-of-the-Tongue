import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerEvent, Word } from './events.js';
import type { GuessResult, Guesser } from './guess/types.js';
import { createSession } from './session.js';

// What a real session meets that a demo never does: a two-hour call, a Mac that sleeps, a brief
// pasted as 50,000 characters of anything, speech recognisers that send odd timings, a user
// hammering New conversation.

const T0 = 1_000_000;
const pharmacy: GuessResult = {
  candidates: [{ word: 'pharmacy', confidence: 0.9 }],
  abstain: false,
  latencyMs: 10,
};

function setup(guess: Guesser = async () => pharmacy, extra: object = {}) {
  const events: ServerEvent[] = [];
  const errors: unknown[] = [];
  const session = createSession((e) => events.push(e), {
    guess,
    pauseMs: 1500,
    minConfidence: 0.6,
    cooldownMs: 8000,
    acceptWindowMs: 10_000,
    moveOnWords: 6,
    speculateAfterMs: 300,
    onError: (err) => errors.push(err),
    ...extra,
  });
  const say = (text: string, endAt = Date.now(), gapMs = 300): number => {
    const parts = text.split(' ');
    const words: Word[] = parts.map((t, i) => ({
      text: t,
      startMs: endAt - (parts.length - i) * gapMs,
      endMs: endAt - (parts.length - i) * gapMs + 100,
    }));
    session.handle({ type: 'transcript.final', words });
    return words.at(-1)?.endMs ?? 0;
  };
  const of = (type: ServerEvent['type']) => events.filter((e) => e.type === type);
  return { session, events, errors, say, of };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

describe('a two-hour call', () => {
  it('keeps working after 4,800 spoken words, with what the guesser reads still bounded', async () => {
    const seen: string[] = [];
    const { session, say, of, errors } = setup(async (input) => {
      seen.push(input.conversation);
      return pharmacy;
    });
    // 600 sentences of eight words with a breath between: past the buffer's 3,000-word limit.
    for (let s = 0; s < 600; s++) {
      say('we went over the numbers for the quarter', Date.now() + 3000);
      await vi.advanceTimersByTimeAsync(3000);
    }
    expect(errors).toEqual([]);
    expect(of('guess.offered')).toHaveLength(0); // finished sentences: nothing to find

    // Still responsive: a real stall right now is found and offered.
    say('I need to go to the');
    await vi.advanceTimersByTimeAsync(2000);
    expect(of('guess.offered')).toHaveLength(1);
    const words = (seen.at(-1) ?? '').split(' ').filter((w) => w !== '…').length;
    expect(words).toBeLessThanOrEqual(1200);
    session.close();
  }, 60_000);

  it('checks for a stall in well under a millisecond-scale budget with a full buffer', () => {
    const { session, say } = setup(undefined, { speculateAfterMs: 0 });
    for (let s = 0; s < 600; s++) say('one two three four five six seven eight', Date.now() - s);
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) session.handle({ type: 'transcript.partial', words: [] });
    const perCheck = (performance.now() - t0) / 200;
    // The server runs this ten times a second per connection.
    expect(perCheck).toBeLessThan(5);
    session.close();
  });
});

describe('the Mac sleeps mid-call', () => {
  it('does not offer a word for a sentence that ended eight hours ago', async () => {
    const { session, say, of } = setup();
    say('I need to go to the');
    // Sleep: no timers run, then the clock jumps.
    vi.setSystemTime(T0 + 8 * 3600_000);
    await vi.advanceTimersByTimeAsync(500);
    expect(of('stuck.detected')).toHaveLength(0);
    expect(of('guess.offered')).toHaveLength(0);
    session.close();
  });

  it('works normally for new speech after waking', async () => {
    const { session, say, of } = setup();
    say('hello there');
    vi.setSystemTime(T0 + 8 * 3600_000);
    await vi.advanceTimersByTimeAsync(500);
    say('I need to go to the');
    await vi.advanceTimersByTimeAsync(2000);
    expect(of('guess.offered')).toHaveLength(1);
    session.close();
  });
});

describe('a brief pasted as 50,000 characters', () => {
  const briefs: [string, string][] = [
    ['emoji', '🚀'.repeat(25_000)],
    ['Chinese', '会议议程'.repeat(12_500)],
    ['right-to-left', 'שלום עולם '.repeat(5000)],
    ['one unbroken word', 'x'.repeat(50_000)],
    ['capitalised names', Array.from({ length: 5000 }, (_, i) => `Name${i}`).join(' ')],
    ['only spaces and newlines', ' \n\t'.repeat(16_000)],
    ['control characters', '\u0000\u0007\u001b'.repeat(16_000)],
  ];

  it.each(briefs)('%s: accepted without a crash, with a bounded reply', async (_n, text) => {
    const builds: string[] = [];
    const { session, of, errors } = setup(undefined, {
      buildGlossary: async (brief: string) => {
        builds.push(brief);
        return 'Northwind, Priya';
      },
    });
    session.handle({ type: 'session.brief', text });
    await vi.advanceTimersByTimeAsync(10);
    expect(errors).toEqual([]);
    const terms = of('brief.terms');
    expect(terms.length).toBeGreaterThanOrEqual(1);
    for (const t of terms) expect((t as { terms: string[] }).terms.length).toBeLessThanOrEqual(60);
    expect(builds.length).toBeLessThanOrEqual(1);
    expect(session.keyterms().length).toBeLessThanOrEqual(100);
    session.close();
  });

  it('a glossary builder that fails or never answers leaves the call working', async () => {
    for (const build of [
      () => Promise.reject(new Error('429 rate limited')),
      () => new Promise<string>(() => undefined),
    ]) {
      const { session, say, of, errors } = setup(undefined, { buildGlossary: build });
      session.handle({ type: 'session.brief', text: 'Q3 review with Northwind. '.repeat(2000) });
      await vi.advanceTimersByTimeAsync(10);
      say('I need to go to the');
      await vi.advanceTimersByTimeAsync(2000);
      expect(of('guess.offered')).toHaveLength(1);
      expect(errors.length).toBeLessThanOrEqual(1);
      session.close();
    }
  });
});

describe('odd timings from a speech recogniser', () => {
  it('fast speech, twenty words inside one second, is not a stall and does not crash', async () => {
    const { session, say, of, errors } = setup();
    for (let i = 0; i < 20; i++) {
      say('and then we should really go', Date.now() + 50);
      await vi.advanceTimersByTimeAsync(50);
    }
    expect(errors).toEqual([]);
    expect(of('stuck.detected')).toHaveLength(0);
    session.close();
  });

  it('words with the same time, backwards times and zero length are tolerated', async () => {
    const { session, of, errors } = setup();
    const t = Date.now();
    const odd: Word[] = [
      { text: 'same', startMs: t, endMs: t },
      { text: 'same', startMs: t, endMs: t },
      { text: 'backwards', startMs: t + 500, endMs: t + 100 },
      { text: 'to', startMs: t - 5000, endMs: t - 4900 },
      { text: 'the', startMs: t + 100, endMs: t + 200 },
    ];
    session.handle({ type: 'transcript.final', words: odd });
    await vi.advanceTimersByTimeAsync(3000);
    expect(errors).toEqual([]);
    expect(of('guess.offered').length).toBeLessThanOrEqual(1);
    session.close();
  });

  it('empty transcripts, partials that clear and finals with no words change nothing', async () => {
    const { session, events, errors } = setup();
    for (let i = 0; i < 50; i++) {
      session.handle({ type: 'transcript.partial', words: [] });
      session.handle({ type: 'transcript.final', words: [] });
    }
    await vi.advanceTimersByTimeAsync(5000);
    expect(errors).toEqual([]);
    expect(events.filter((e) => e.type !== 'session.cleared')).toEqual([]);
    session.close();
  });

  it('emoji, Chinese, Arabic and Cyrillic words flow through and can be accepted', async () => {
    const word = 'Москва';
    const { session, say, of, events } = setup(async () => ({
      candidates: [{ word, confidence: 0.9 }],
      abstain: false,
      latencyMs: 5,
    }));
    say('我们明天要去 🚀 مرحبا to the');
    await vi.advanceTimersByTimeAsync(2000);
    expect(of('guess.offered')).toHaveLength(1);
    say(word, Date.now() + 200);
    await vi.advanceTimersByTimeAsync(500);
    expect(events.some((e) => e.type === 'guess.accepted')).toBe(true);
    session.close();
  });
});

describe('New conversation pressed over and over', () => {
  it('leaves nothing from the old conversation, however fast and however many', async () => {
    const guess: Guesser = () => new Promise((resolve) => setTimeout(() => resolve(pharmacy), 400));
    const { session, say, of, errors } = setup(guess);
    for (let i = 0; i < 200; i++) {
      say('I need to go to the');
      await vi.advanceTimersByTimeAsync(350); // a guess is in flight
      session.handle({ type: 'session.reset' });
    }
    await vi.advanceTimersByTimeAsync(5000);
    expect(errors).toEqual([]);
    expect(of('session.cleared')).toHaveLength(200);
    expect(of('guess.offered')).toHaveLength(0);
    session.close();
  });
});
