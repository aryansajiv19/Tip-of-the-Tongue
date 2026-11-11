import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerEvent, Word } from './events.js';
import type { Guesser } from './guess/types.js';
import { mockGuesser } from './guess/mock.js';
import { createSession } from './session.js';

const T0 = 1_000_000;

function setup(
  guess: Guesser = mockGuesser,
  extra: {
    speculateAfterMs?: number;
    maxCallsPerMinute?: number;
    trace?: (r: Record<string, unknown>) => void;
    escalate?: Guesser;
  } = {},
) {
  const events: ServerEvent[] = [];
  const session = createSession((e) => events.push(e), {
    guess,
    pauseMs: 1500,
    minConfidence: 0.6,
    cooldownMs: 8000,
    acceptWindowMs: 10_000,
    moveOnWords: 6,
    now: () => Date.now(),
    ...extra,
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
    // The continuation rides along on the offer; accepting still means the word alone.
    expect(offer?.type === 'guess.offered' && offer.candidates[0]?.continuation).toBe(
      'to pick up my tablets',
    );

    say('pharmacy');
    await vi.advanceTimersByTimeAsync(300);
    expect(types()).toContain('guess.accepted');
    session.close();
  });

  it('does not offer a word the user said just after the stall marker', async () => {
    const { session, say, types } = setup();
    say('can you pass the the thing for cutting bread knife');
    await vi.advanceTimersByTimeAsync(2000);
    expect(types()).toEqual(['stuck.detected', 'guess.idle']);
    session.close();
  });

  it('offers it when the word was not said', async () => {
    const { session, say, types } = setup();
    say('can you pass the the thing for cutting bread');
    await vi.advanceTimersByTimeAsync(2000);
    expect(types()).toContain('guess.offered');
    session.close();
  });

  it('a longer pause setting delays the trigger', async () => {
    const { session, say, types } = setup();
    session.handle({ type: 'session.settings', pauseMs: 3000 });
    say('I need to go to the');
    await vi.advanceTimersByTimeAsync(2500);
    expect(types()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(types()).toContain('stuck.detected');
    session.close();
  });

  it('a shorter pause setting speeds it up', async () => {
    const { session, say, types } = setup();
    session.handle({ type: 'session.settings', pauseMs: 800 });
    say('I need to go to the');
    await vi.advanceTimersByTimeAsync(1100);
    expect(types()).toContain('stuck.detected');
    session.close();
  });

  it('the default pause does not trigger that early', async () => {
    const { session, say, types } = setup();
    say('I need to go to the');
    await vi.advanceTimersByTimeAsync(1100);
    expect(types()).toEqual([]);
    session.close();
  });

  describe('guess.picked', () => {
    // Speaks the demo stall and waits for the offer.
    async function offered() {
      const ctx = setup();
      ctx.say('I need to go to the the place where you get medicine');
      await vi.advanceTimersByTimeAsync(2000);
      const o = ctx.events.find((e) => e.type === 'guess.offered');
      if (o?.type !== 'guess.offered') throw new Error('no offer');
      return { ...ctx, id: o.id };
    }
    const accepted = (events: ServerEvent[]) => events.filter((e) => e.type === 'guess.accepted');

    it('counts a click like a spoken acceptance', async () => {
      const { session, events, id } = await offered();
      await vi.advanceTimersByTimeAsync(400);
      session.handle({ type: 'guess.picked', id, word: 'chemist' });
      const [a] = accepted(events);
      expect(a).toMatchObject({ type: 'guess.accepted', id, word: 'chemist' });
      expect(a?.type === 'guess.accepted' && a.afterMs).toBeGreaterThanOrEqual(400);
      // The offer is closed: nothing else follows for it.
      await vi.advanceTimersByTimeAsync(20_000);
      expect(events.map((e) => e.type)).not.toContain('guess.expired');
      session.close();
    });

    it('matches the word the way speech does (case, plural) and reports the offered spelling', async () => {
      const { session, events, id } = await offered();
      session.handle({ type: 'guess.picked', id, word: ' Pharmacies ' });
      expect(accepted(events)).toMatchObject([{ word: 'pharmacy' }]);
      session.close();
    });

    it('ignores a stale id', async () => {
      const { session, events } = await offered();
      session.handle({ type: 'guess.picked', id: 'not-the-offer', word: 'pharmacy' });
      expect(accepted(events)).toEqual([]);
      session.close();
    });

    it('ignores a word that was not offered, and the offer stays open', async () => {
      const { session, say, events, id } = await offered();
      session.handle({ type: 'guess.picked', id, word: 'hospital' });
      session.handle({ type: 'guess.picked', id, word: 'pharmacy chemist' });
      expect(accepted(events)).toEqual([]);
      say('pharmacy');
      await vi.advanceTimersByTimeAsync(300);
      expect(accepted(events)).toHaveLength(1);
      session.close();
    });

    it('ignores a click after the offer expired', async () => {
      const { session, events, id } = await offered();
      await vi.advanceTimersByTimeAsync(11_000);
      expect(events.map((e) => e.type)).toContain('guess.expired');
      session.handle({ type: 'guess.picked', id, word: 'pharmacy' });
      expect(accepted(events)).toEqual([]);
      session.close();
    });

    it('ignores a click in the moment between the window ending and the next poll', async () => {
      const { session, events, id } = await offered();
      vi.setSystemTime(Date.now() + 10_050);
      session.handle({ type: 'guess.picked', id, word: 'pharmacy' });
      expect(accepted(events)).toEqual([]);
      session.close();
    });

    it('accepts once: a second click does nothing', async () => {
      const { session, events, id } = await offered();
      session.handle({ type: 'guess.picked', id, word: 'pharmacy' });
      session.handle({ type: 'guess.picked', id, word: 'chemist' });
      expect(accepted(events)).toHaveLength(1);
      session.close();
    });

    it('ignores a click when no offer is open', () => {
      const { session, events } = setup();
      session.handle({ type: 'guess.picked', id: 'x', word: 'pharmacy' });
      expect(events).toEqual([]);
      session.close();
    });
  });

  it('a higher minConfidence setting holds back a guess that the default would offer', async () => {
    const { session, say, types } = setup();
    // The mock's best word for this line is 0.85.
    session.handle({ type: 'session.settings', pauseMs: 1500, minConfidence: 0.9 });
    say('I need to go to the the place where you get medicine');
    await vi.advanceTimersByTimeAsync(3000);
    expect(types()).not.toContain('guess.offered');
    session.close();
  });

  it('a lower minConfidence setting lets a weaker guess through', async () => {
    const guess: Guesser = async () => ({
      candidates: [{ word: 'pharmacy', confidence: 0.5 }],
      abstain: false,
      latencyMs: 1,
    });
    const strict = setup(guess);
    strict.say('I need to go to the the place where you get medicine');
    await vi.advanceTimersByTimeAsync(3000);
    expect(strict.types()).not.toContain('guess.offered');
    strict.session.close();

    vi.setSystemTime(T0);
    const eager = setup(guess);
    eager.session.handle({ type: 'session.settings', pauseMs: 900, minConfidence: 0.45 });
    eager.say('I need to go to the the place where you get medicine');
    await vi.advanceTimersByTimeAsync(3000);
    expect(eager.types()).toContain('guess.offered');
    eager.session.close();
  });

  it('settings without minConfidence leave it unchanged', async () => {
    const { session, say, types } = setup();
    session.handle({ type: 'session.settings', pauseMs: 1500, minConfidence: 0.9 });
    session.handle({ type: 'session.settings', pauseMs: 1500 });
    say('I need to go to the the place where you get medicine');
    await vi.advanceTimersByTimeAsync(3000);
    expect(types()).not.toContain('guess.offered');
    session.close();
  });

  it('stays silent on fluent speech', async () => {
    const { session, say, events } = setup();
    say('we shipped the new release on Tuesday and the customers liked it.');
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

  describe('voice activity', () => {
    const voice = (session: ReturnType<typeof setup>['session'], voiced: boolean) =>
      session.handle({ type: 'voice.activity', voiced, atMs: Date.now() });
    const stuck = (events: ServerEvent[]) =>
      events.flatMap((e) => (e.type === 'stuck.detected' ? [e.reason] : []));

    it('a pause while the user is still making sound is not a stall', async () => {
      const { session, events, say } = setup();
      say('we need to talk about the');
      voice(session, true);
      await vi.advanceTimersByTimeAsync(700);
      // The words are 1.7 s old by now, but the user is still making sound: speech
      // recognition is just behind.
      await vi.advanceTimersByTimeAsync(1000);
      expect(stuck(events)).toEqual([]);
      voice(session, false);
      await vi.advanceTimersByTimeAsync(1700);
      expect(stuck(events)).toEqual(['hum']); // 1.7 s of sound and still no words
      session.close();
    });

    it('a hum the speech recognition dropped is a stall cue', async () => {
      const { session, events, say } = setup();
      say('we need to sort out the');
      await vi.advanceTimersByTimeAsync(300);
      voice(session, true);
      await vi.advanceTimersByTimeAsync(1000);
      voice(session, false);
      await vi.advanceTimersByTimeAsync(900);
      expect(stuck(events)).toEqual(['hum']);
      session.close();
    });

    it('humming and then saying a word does not trigger', async () => {
      const { session, events, say } = setup();
      say('we need to sort out the');
      await vi.advanceTimersByTimeAsync(100);
      voice(session, true);
      await vi.advanceTimersByTimeAsync(850);
      voice(session, false);
      await vi.advanceTimersByTimeAsync(350);
      say('renewal');
      await vi.advanceTimersByTimeAsync(700);
      expect(stuck(events)).toEqual([]);
      session.close();
    });

    it('ignores a duplicate or out-of-order voice event', async () => {
      const { session, events, say } = setup();
      say('we need to talk about the');
      session.handle({ type: 'voice.activity', voiced: false, atMs: Date.now() });
      session.handle({ type: 'voice.activity', voiced: true, atMs: Date.now() });
      session.handle({ type: 'voice.activity', voiced: true, atMs: Date.now() - 5000 });
      session.handle({ type: 'voice.activity', voiced: false, atMs: Date.now() - 5000 });
      await vi.advanceTimersByTimeAsync(3000);
      expect(stuck(events)).toEqual([]); // still voiced
      session.close();
    });

    it('stops trusting a "voiced" state that lasts longer than anyone could be searching', async () => {
      const { session, events, say } = setup();
      voice(session, true);
      await vi.advanceTimersByTimeAsync(11_000);
      say('and then the');
      await vi.advanceTimersByTimeAsync(1700);
      expect(stuck(events)).toEqual(['pause']);
      session.close();
    });
  });

  describe('asking for a word now', () => {
    const offered = (events: ServerEvent[]) =>
      events.flatMap((e) => (e.type === 'guess.offered' ? [e.candidates.map((c) => c.word)] : []));
    const reasons = (events: ServerEvent[]) =>
      events.flatMap((e) => (e.type === 'stuck.detected' ? [e.reason] : []));
    // Offers a different word each call, with the given confidence.
    const words = (confidence = 0.9): Guesser => {
      let n = 0;
      return async () => ({
        candidates: [{ word: ['alpha', 'bravo', 'charlie'][n++ % 3] as string, confidence }],
        abstain: false,
        latencyMs: 1,
      });
    };

    it('Space gets an offer at once, without waiting for a pause', async () => {
      const { session, events, say } = setup();
      say('the place where you get medicine');
      session.handle({ type: 'stuck.manual' });
      await vi.advanceTimersByTimeAsync(100);
      expect(reasons(events)).toEqual(['manual']);
      expect(offered(events)).toEqual([['pharmacy', 'chemist']]);
      session.close();
    });

    it('does nothing when nothing has been said yet', async () => {
      const { session, events } = setup(words());
      session.handle({ type: 'stuck.manual' });
      await vi.advanceTimersByTimeAsync(500);
      expect(events).toEqual([]);
      session.close();
    });

    it('is still gated by confidence', async () => {
      const { session, events, say } = setup(words(0.3));
      say('we need the');
      session.handle({ type: 'stuck.manual' });
      await vi.advanceTimersByTimeAsync(500);
      expect(reasons(events)).toEqual(['manual']);
      expect(offered(events)).toEqual([]);
      session.close();
    });

    it('works during the offer cooldown', async () => {
      const { session, events, say } = setup(words());
      say('we need the');
      session.handle({ type: 'stuck.manual' });
      await vi.advanceTimersByTimeAsync(100);
      say('alpha');
      await vi.advanceTimersByTimeAsync(300);
      expect(events.map((e) => e.type)).toContain('guess.accepted');
      say('and also the');
      session.handle({ type: 'stuck.manual' }); // a second or two later, well inside the 8 s cooldown
      await vi.advanceTimersByTimeAsync(100);
      expect(offered(events)).toEqual([['alpha'], ['bravo']]);
      session.close();
    });

    it('is ignored while an offer is already showing', async () => {
      const { session, events, say } = setup(words());
      say('we need the');
      session.handle({ type: 'stuck.manual' });
      await vi.advanceTimersByTimeAsync(100);
      session.handle({ type: 'stuck.manual' });
      session.handle({ type: 'stuck.manual' });
      await vi.advanceTimersByTimeAsync(100);
      expect(offered(events)).toEqual([['alpha']]);
      session.close();
    });

    it('saying "what\'s the word for" asks at once', async () => {
      const { session, events, say } = setup(words());
      say("we need the uh what's the word for");
      await vi.advanceTimersByTimeAsync(100);
      expect(reasons(events)).toEqual(['manual']);
      expect(offered(events)).toEqual([['alpha']]);
      session.close();
    });

    it('"what\'s the word" in the middle of a sentence does not', async () => {
      const { session, events, say } = setup(words());
      say("I forgot what's the word you used yesterday in the meeting");
      await vi.advanceTimersByTimeAsync(100);
      expect(reasons(events)).toEqual([]);
      session.close();
    });
  });

  describe('guess.idle', () => {
    const abstain: Guesser = async () => ({ candidates: [], abstain: true, latencyMs: 1 });
    const idleCount = (events: ServerEvent[]) =>
      events.filter((e) => e.type === 'guess.idle').length;

    it('follows a confirmed stall whose guess abstains', async () => {
      const { session, events, say, types } = setup(abstain);
      say('we need to talk about the');
      await vi.advanceTimersByTimeAsync(2000);
      expect(types()).toEqual(['stuck.detected', 'guess.idle']);
      expect(idleCount(events)).toBe(1);
      session.close();
    });

    it('follows a guess that is not confident enough', async () => {
      const unsure: Guesser = async () => ({
        candidates: [{ word: 'renewal', confidence: 0.2 }],
        abstain: false,
        latencyMs: 1,
      });
      const { session, types, say } = setup(unsure);
      say('we need to talk about the');
      await vi.advanceTimersByTimeAsync(2000);
      expect(types()).toEqual(['stuck.detected', 'guess.idle']);
      session.close();
    });

    it('follows a provider error', async () => {
      const broken: Guesser = async () => ({
        candidates: [],
        abstain: true,
        latencyMs: 1,
        error: true,
      });
      const { session, types, say } = setup(broken);
      say('we need to talk about the');
      await vi.advanceTimersByTimeAsync(2000);
      expect(types()).toEqual(['stuck.detected', 'guess.idle']);
      session.close();
    });

    it('is not sent when there is an offer', async () => {
      const { session, types, say } = setup();
      say('I need to go to the the place where you get medicine');
      await vi.advanceTimersByTimeAsync(2000);
      expect(types()).toContain('guess.offered');
      expect(types()).not.toContain('guess.idle');
      session.close();
    });

    it('is not sent for fluent speech or before anything is said', async () => {
      const { session, events, say } = setup(abstain);
      say('we shipped the new release on Tuesday and the customers liked it.');
      await vi.advanceTimersByTimeAsync(5000);
      expect(events).toEqual([]);
      session.close();
    });

    it('is sent when the speaker carries on and the waiting guess is thrown away', async () => {
      let finish: () => void = () => undefined;
      const slow: Guesser = async () => {
        await new Promise<void>((resolve) => (finish = resolve));
        return { candidates: [], abstain: true, latencyMs: 1 };
      };
      const { session, events, say, types } = setup(slow);
      say('we need to talk about the');
      await vi.advanceTimersByTimeAsync(2000);
      expect(types()).toEqual(['stuck.detected']);
      say('budget for next year');
      expect(idleCount(events)).toBe(1);
      finish();
      await vi.advanceTimersByTimeAsync(300);
      expect(idleCount(events)).toBe(1); // the stale result adds nothing
      session.close();
    });
  });

  describe('session.reset', () => {
    const asked: { brief?: string; signal?: AbortSignal }[] = [];
    const recording: Guesser = async (input, signal) => {
      asked.push({ ...(input.brief ? { brief: input.brief } : {}), ...(signal ? { signal } : {}) });
      return mockGuesser(input);
    };
    beforeEach(() => {
      asked.length = 0;
    });

    it('a guess still running at reset never shows, and is aborted', async () => {
      let finish: () => void = () => undefined;
      const slow: Guesser = async (input, signal) => {
        asked.push(signal ? { signal } : {});
        await new Promise<void>((resolve) => (finish = resolve));
        return mockGuesser(input);
      };
      const { session, events, say, types } = setup(slow);
      say('I need to go to the the place where you get medicine');
      await vi.advanceTimersByTimeAsync(2000);
      expect(types()).toEqual(['stuck.detected']);
      session.handle({ type: 'session.reset' });
      expect(asked[0]?.signal?.aborted).toBe(true);
      finish();
      await vi.advanceTimersByTimeAsync(2000);
      expect(types()).toEqual(['stuck.detected', 'session.cleared']); // no offer, no idle
      expect(events.some((e) => e.type === 'guess.offered')).toBe(false);
      session.close();
    });

    it('an open offer is forgotten: saying its word later does nothing, and it never expires', async () => {
      const { session, events, say, types } = setup();
      say('I need to go to the the place where you get medicine');
      await vi.advanceTimersByTimeAsync(2000);
      expect(types()).toContain('guess.offered');
      session.handle({ type: 'session.reset' });
      say('pharmacy');
      await vi.advanceTimersByTimeAsync(12_000);
      expect(events.filter((e) => e.type === 'guess.offered')).toHaveLength(1);
      expect(events.some((e) => e.type === 'guess.accepted' || e.type === 'guess.expired')).toBe(
        false,
      );
      session.close();
    });

    it('forgets the cooldown and the offer history: the same word can be offered at once', async () => {
      const { session, events, say } = setup();
      say('I need to go to the the place where you get medicine');
      await vi.advanceTimersByTimeAsync(2000);
      session.handle({ type: 'session.reset' });
      await vi.advanceTimersByTimeAsync(300);
      say('now I need to go to the the place where you get medicine');
      await vi.advanceTimersByTimeAsync(2000);
      const offers = events.filter((e) => e.type === 'guess.offered');
      expect(offers).toHaveLength(2);
      session.close();
    });

    it('keeps the brief and the settings', async () => {
      const { session, events, say } = setup(recording);
      session.handle({ type: 'session.brief', text: 'Q3 review with Northwind' });
      session.handle({ type: 'session.settings', pauseMs: 4000 });
      session.handle({ type: 'session.reset' });
      say('we need to talk about the');
      await vi.advanceTimersByTimeAsync(2500); // longer than the default pause, shorter than 4 s
      // The brief's terms were sent when it was loaded; nothing else but the reset's answer.
      expect(events.map((e) => e.type)).toEqual(['brief.terms', 'session.cleared']);
      await vi.advanceTimersByTimeAsync(2000);
      expect(events.map((e) => e.type)).toContain('stuck.detected');
      expect(asked[0]?.brief).toContain('Northwind');
      session.close();
    });

    it('drops words that were in flight from before the reset, keeps later ones', async () => {
      const { session, events, say } = setup();
      const before = Date.now();
      say('we need to talk about the'); // advances the clock past `before`
      session.handle({ type: 'session.reset' });
      const old = { text: 'thing', startMs: before, endMs: before + 200 };
      session.handle({ type: 'transcript.final', words: [old] });
      session.handle({ type: 'transcript.partial', words: [old] });
      await vi.advanceTimersByTimeAsync(3000);
      expect(events.map((e) => e.type)).toEqual(['session.cleared']); // nothing left to be stuck on
      say('and then the');
      await vi.advanceTimersByTimeAsync(2000);
      expect(events.map((e) => e.type)).toContain('stuck.detected');
      session.close();
    });

    it('afterReset filters words by the time of the reset', () => {
      const { session } = setup();
      vi.advanceTimersByTime(1000);
      session.handle({ type: 'session.reset' });
      const at = Date.now();
      const kept = session.afterReset([
        { text: 'old', startMs: at - 500, endMs: at - 100 },
        { text: 'edge', startMs: at - 100, endMs: at },
        { text: 'new', startMs: at + 10, endMs: at + 200 },
      ]);
      expect(kept.map((w) => w.text)).toEqual(['new']);
      session.close();
    });

    it('answers with session.cleared, after which nothing from the old conversation follows', async () => {
      const { session, events, say } = setup();
      say('I need to go to the the place where you get medicine');
      session.handle({ type: 'session.reset' });
      await vi.advanceTimersByTimeAsync(3000);
      expect(events.at(-1)?.type).toBe('session.cleared');
      expect(events.filter((e) => e.type === 'session.cleared')).toHaveLength(1);
      session.close();
    });

    it('a reset with nothing going on is harmless', () => {
      const { session, events } = setup();
      session.handle({ type: 'session.reset' });
      session.handle({ type: 'session.reset' });
      expect(events).toEqual([{ type: 'session.cleared' }, { type: 'session.cleared' }]);
      session.close();
    });
  });

  describe('guesser status', () => {
    const failing: Guesser = async () => ({
      candidates: [],
      abstain: true,
      latencyMs: 1,
      error: true,
    });
    const statuses = (events: ServerEvent[]) =>
      events.flatMap((e) => (e.type === 'guesser.status' ? [e.ok] : []));

    // Each call is a new stall: words, then a pause long enough for a guess.
    async function stall(say: (t: string) => void, n: number) {
      say(`can you pass me the thing number${n}`);
      await vi.advanceTimersByTimeAsync(2000);
    }

    it('says nothing after one failure, reports ok:false after two in a row, only once', async () => {
      const { session, events, say } = setup(failing);
      await stall(say, 1);
      expect(statuses(events)).toEqual([]);
      await stall(say, 2);
      expect(statuses(events)).toEqual([false]);
      await stall(say, 3);
      expect(statuses(events)).toEqual([false]);
      session.close();
    });

    it('reports ok:true on the next success', async () => {
      let fail = true;
      const { session, events, say } = setup((i) => (fail ? failing(i) : mockGuesser(i)));
      await stall(say, 1);
      await stall(say, 2);
      fail = false;
      await stall(say, 3);
      expect(statuses(events)).toEqual([false, true]);
      session.close();
    });

    it('a success between failures resets the count', async () => {
      const results = [failing, mockGuesser, failing];
      let i = 0;
      const { session, events, say } = setup((input) => (results[i++ % 3] ?? failing)(input));
      await stall(say, 1);
      await stall(say, 2);
      await stall(say, 3);
      expect(statuses(events)).toEqual([]);
      session.close();
    });

    it('sends nothing for normal abstains', async () => {
      const abstain: Guesser = async () => ({ candidates: [], abstain: true, latencyMs: 1 });
      const { session, events, say } = setup(abstain);
      for (let n = 1; n <= 4; n++) await stall(say, n);
      expect(statuses(events)).toEqual([]);
      session.close();
    });

    const refused =
      (status: number, retryAfterMs?: number): Guesser =>
      async () => ({
        candidates: [],
        abstain: true,
        latencyMs: 1,
        error: true,
        status,
        ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
      });
    const reasons = (events: ServerEvent[]) =>
      events.flatMap((e) => (e.type === 'guesser.status' ? [e.reason] : []));

    it('reports a refused key at once, with the reason', async () => {
      const { session, events, say } = setup(refused(401));
      await stall(say, 1);
      expect(statuses(events)).toEqual([false]);
      expect(reasons(events)).toEqual(['key']);
      session.close();
    });

    it('reports a rate limit as busy after two failures', async () => {
      const { session, events, say } = setup(refused(429));
      await stall(say, 1);
      await stall(say, 2);
      expect(reasons(events)).toEqual(['busy']);
      session.close();
    });

    describe('backoff', () => {
      // One early guess per call: speak, wait past the early threshold but not a stall.
      async function early(say: (t: string) => void, n: number) {
        // Two words, so the silence before the next call stays under the 1.5 s stall pause.
        say(`pass thing${n}`);
        await vi.advanceTimersByTimeAsync(700);
      }

      it('starts no early guess for the retry-after wait, clamped to 5 to 30 s', async () => {
        const guess = vi.fn(refused(429, 1000)); // asks for 1 s: raised to 5 s
        const { session, say } = setup(guess, { speculateAfterMs: 500 });
        await early(say, 1);
        expect(guess).toHaveBeenCalledTimes(1);
        await early(say, 2);
        expect(guess).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(5000); // the confirmed stall still asks once
        const before = guess.mock.calls.length;
        await early(say, 3);
        expect(guess).toHaveBeenCalledTimes(before + 1);
        session.close();
      });

      it('caps a long retry-after at 30 s', async () => {
        const guess = vi.fn(refused(529, 600_000));
        const { session, say } = setup(guess, { speculateAfterMs: 500 });
        await early(say, 1);
        await vi.advanceTimersByTimeAsync(31_000);
        const before = guess.mock.calls.length;
        await early(say, 2);
        expect(guess).toHaveBeenCalledTimes(before + 1);
        session.close();
      });
    });

    it('counts a guesser that throws as a failure', async () => {
      const throwing: Guesser = () => Promise.reject(new Error('boom'));
      const { session, events, say } = setup(throwing);
      await stall(say, 1);
      await stall(say, 2);
      expect(statuses(events)).toEqual([false]);
      session.close();
    });
  });

  describe('language', () => {
    it('is English until the user chooses one, then goes to the guesser', async () => {
      for (const [chosen, expected] of [
        [undefined, 'en'],
        ['es', 'es'],
        ['multi', 'multi'],
      ] as const) {
        const guess = vi.fn<Guesser>(mockGuesser);
        const { session, say } = setup(guess);
        if (chosen) session.handle({ type: 'session.settings', language: chosen });
        say('I need to go to the the place where you get medicine');
        await vi.advanceTimersByTimeAsync(2000);
        expect(guess.mock.calls.at(-1)?.[0].language).toBe(expected);
        session.close();
      }
    });

    it('"cómo se dice" asks at once in Spanish and not in English', async () => {
      const guess = vi.fn<Guesser>(mockGuesser);
      const es = setup(guess);
      es.session.handle({ type: 'session.settings', language: 'es' });
      es.say('necesito el cómo se dice');
      await vi.advanceTimersByTimeAsync(50);
      expect(es.events.some((e) => e.type === 'stuck.detected' && e.reason === 'manual')).toBe(
        true,
      );
      es.session.close();
      const en = setup(guess);
      en.say('necesito el cómo se dice');
      await vi.advanceTimersByTimeAsync(50);
      expect(en.events.some((e) => e.type === 'stuck.detected' && e.reason === 'manual')).toBe(
        false,
      );
      en.session.close();
    });
  });

  describe('call cap', () => {
    const stall = 'can you pass me the thing';
    it('asks Claude at most the cap per minute, then stays silent until the minute passes', async () => {
      const guess = vi.fn<Guesser>(mockGuesser);
      const { session, say } = setup(guess, { maxCallsPerMinute: 3 });
      for (let n = 0; n < 5; n++) {
        say(`${stall} number${n}`);
        await vi.advanceTimersByTimeAsync(2000);
      }
      expect(guess).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(60_000);
      say(`${stall} again`);
      await vi.advanceTimersByTimeAsync(2000);
      expect(guess).toHaveBeenCalledTimes(4);
      session.close();
    });

    it('lets a manual ask through when capped, and counts it', async () => {
      const guess = vi.fn<Guesser>(mockGuesser);
      const { session, say } = setup(guess, { maxCallsPerMinute: 1 });
      say(`${stall} one`);
      await vi.advanceTimersByTimeAsync(2000);
      say('I need the place where you get medicine');
      session.handle({ type: 'stuck.manual' });
      await vi.advanceTimersByTimeAsync(50);
      expect(guess).toHaveBeenCalledTimes(2);
      session.close();
    });

    it('sends idle, not a pop-up, for a stall that was capped', async () => {
      const { session, events, say } = setup(mockGuesser, { maxCallsPerMinute: 0 });
      say('I need to go to the the place where you get medicine');
      await vi.advanceTimersByTimeAsync(2000);
      expect(events.map((e) => e.type)).not.toContain('guess.offered');
      expect(events.map((e) => e.type)).toContain('guess.idle');
      session.close();
    });
  });

  describe('meeting prep', () => {
    const stall = 'I need to go to the the place where you get medicine';
    const terms = (events: ServerEvent[]) =>
      events.flatMap((e) => (e.type === 'brief.terms' ? [e.terms] : []));
    const offeredWords = (events: ServerEvent[]) =>
      events.flatMap((e) => (e.type === 'guess.offered' ? e.candidates : []));

    it('sends the key terms of a short brief right away', () => {
      const { session, events } = setup();
      session.handle({
        type: 'session.brief',
        text: 'Q3 review with Northwind Analytics. Renewal of the SOC 2 licence.',
      });
      expect(terms(events)).toHaveLength(1);
      expect(terms(events)[0]).toEqual(
        expect.arrayContaining(['Q3', 'Northwind Analytics', 'SOC 2']),
      );
      session.close();
    });

    it('leaves out single characters and bare numbers', () => {
      const { session, events } = setup();
      session.handle({ type: 'session.brief', text: 'Northwind pilot. ARR target: 4.2M in 2026.' });
      const sent = terms(events)[0] ?? [];
      expect(sent).toContain('ARR');
      expect(sent.filter((t) => t.length < 2 || /^\d+$/.test(t))).toEqual([]);
      session.close();
    });

    it('sends an empty list when the brief is cleared', () => {
      const { session, events } = setup();
      session.handle({ type: 'session.brief', text: 'Northwind Analytics' });
      session.handle({ type: 'session.brief', text: '   ' });
      expect(terms(events).at(-1)).toEqual([]);
      session.close();
    });

    it('sends at most 60 terms', () => {
      const { session, events } = setup();
      const many = Array.from({ length: 150 }, (_, i) => `Client${i}X`).join(', ');
      session.handle({ type: 'session.brief', text: many });
      expect(terms(events)[0]?.length).toBeLessThanOrEqual(60);
      session.close();
    });

    it('sends the glossary terms again when the glossary of a long brief is ready', async () => {
      const long = `Lumenfield overview. ${'x'.repeat(3500)} The churn rate is rising.`;
      const events: ServerEvent[] = [];
      const session = createSession((e) => events.push(e), {
        guess: mockGuesser,
        buildGlossary: () => Promise.resolve('churn rate, Lumenfield'),
        pauseMs: 1500,
        minConfidence: 0.6,
        cooldownMs: 8000,
        acceptWindowMs: 10_000,
        moveOnWords: 6,
        now: () => Date.now(),
      });
      session.handle({ type: 'session.brief', text: long, source: 'overview.pdf' });
      expect(terms(events)).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(10);
      expect(terms(events)).toHaveLength(2);
      expect(terms(events)[1]).toEqual(['churn rate', 'Lumenfield']);
      session.close();
    });

    it('names the document on a candidate whose word appears in it, and only that one', async () => {
      const { session, events, say } = setup();
      session.handle({
        type: 'session.brief',
        text: 'Errands: the pharmacy opens at nine.',
        source: 'errands.pdf',
      });
      say(stall);
      await vi.advanceTimersByTimeAsync(2000);
      const words = offeredWords(events);
      expect(words.find((c) => c.word === 'pharmacy')).toMatchObject({ source: 'errands.pdf' });
      expect(words.find((c) => c.word === 'chemist')).not.toHaveProperty('source');
      session.close();
    });

    it('does not name a document for a pasted brief without a file name', async () => {
      const { session, events, say } = setup();
      session.handle({ type: 'session.brief', text: 'Errands: the pharmacy opens at nine.' });
      say(stall);
      await vi.advanceTimersByTimeAsync(2000);
      expect(offeredWords(events).length).toBeGreaterThan(0);
      expect(offeredWords(events).some((c) => 'source' in c)).toBe(false);
      session.close();
    });

    it('forgets the document when the brief is replaced or cleared', async () => {
      const { session, events, say } = setup();
      session.handle({ type: 'session.brief', text: 'the pharmacy opens', source: 'a.pdf' });
      session.handle({ type: 'session.brief', text: 'the pharmacy opens' });
      say(stall);
      await vi.advanceTimersByTimeAsync(2000);
      expect(offeredWords(events).some((c) => 'source' in c)).toBe(false);
      session.close();
    });

    it('does not match a word that only appears inside a longer word', async () => {
      const { session, events, say } = setup();
      session.handle({
        type: 'session.brief',
        text: 'Pharmacies and chemists nearby',
        source: 'list.md',
      });
      say(stall);
      await vi.advanceTimersByTimeAsync(2000);
      expect(offeredWords(events).some((c) => 'source' in c)).toBe(false);
      session.close();
    });
  });

  describe('long briefs', () => {
    const long = `Lumenfield overview. ${'x'.repeat(3500)} The churn rate is rising.`;
    const stall = 'I need to go to the the place where you get medicine';

    function longSetup(buildGlossary: (doc: string) => Promise<string | undefined>) {
      const guess = vi.fn<Guesser>(mockGuesser);
      const events: ServerEvent[] = [];
      const session = createSession((e) => events.push(e), {
        guess,
        buildGlossary,
        pauseMs: 1500,
        minConfidence: 0.6,
        cooldownMs: 8000,
        acceptWindowMs: 10_000,
        moveOnWords: 6,
        now: () => Date.now(),
      });
      const say = (text: string) => {
        const words: Word[] = text.split(' ').map((w, i) => {
          const at = Date.now() + i * 300;
          return { text: w, startMs: at, endMs: at + 250 };
        });
        vi.advanceTimersByTime(words.length * 300);
        session.handle({ type: 'transcript.final', words });
      };
      return { session, guess, say };
    }

    it('builds the glossary once, in the background, for a long brief only', async () => {
      const build = vi.fn(() => Promise.resolve('churn rate'));
      const { session } = longSetup(build);
      session.handle({ type: 'session.brief', text: 'short brief' });
      expect(build).not.toHaveBeenCalled();
      session.handle({ type: 'session.brief', text: long });
      expect(build).toHaveBeenCalledTimes(1);
      expect(build).toHaveBeenCalledWith(long);
      session.close();
    });

    it('guesses from the start of the document until the glossary is ready, then adds it', async () => {
      let resolve: (g: string) => void = () => undefined;
      const pending = new Promise<string>((r) => (resolve = r));
      const { session, guess, say } = longSetup(() => pending);
      session.handle({ type: 'session.brief', text: long });
      say(stall);
      await vi.advanceTimersByTimeAsync(2000);
      expect(guess.mock.calls[0]?.[0].brief).toBe(long.slice(0, 1500));

      resolve('churn rate, SOC 2');
      await vi.advanceTimersByTimeAsync(10_000);
      say(`${stall} again`);
      await vi.advanceTimersByTimeAsync(2000);
      const last = guess.mock.calls.at(-1)?.[0].brief;
      expect(last).toBe(`Key terms: churn rate, SOC 2\n\n${long.slice(0, 1500)}`);
      session.close();
    });

    it('ignores a glossary that arrives after the brief was replaced', async () => {
      let resolve: (g: string) => void = () => undefined;
      const pending = new Promise<string>((r) => (resolve = r));
      const { session, guess, say } = longSetup(() => pending);
      session.handle({ type: 'session.brief', text: long });
      session.handle({ type: 'session.brief', text: 'Q3 review with Northwind' });
      resolve('stale terms');
      await vi.advanceTimersByTimeAsync(10);
      say(stall);
      await vi.advanceTimersByTimeAsync(2000);
      expect(guess.mock.calls[0]?.[0].brief).toBe('Q3 review with Northwind');
      session.close();
    });

    it('carries on with the start of the document if the glossary fails', async () => {
      const { session, guess, say } = longSetup(() => Promise.reject(new Error('boom')));
      session.handle({ type: 'session.brief', text: long });
      say(stall);
      await vi.advanceTimersByTimeAsync(2000);
      expect(guess.mock.calls[0]?.[0].brief).toBe(long.slice(0, 1500));
      session.close();
    });
  });

  it('gives the guesser the whole recent call, not just the last few sentences', async () => {
    const guess = vi.fn<Guesser>(mockGuesser);
    const { session, say } = setup(guess);
    say('Brightstone is our supplier');
    const filler = Array.from({ length: 300 }, (_, i) => `word${i}`).join(' ');
    say(filler);
    say('I need to go to the the place where you get medicine');
    await vi.advanceTimersByTimeAsync(2000);
    const conversation = guess.mock.calls.at(-1)?.[0].conversation ?? '';
    expect(conversation).toContain('Brightstone');
    expect(conversation).toContain('medicine');
    session.close();
  });

  it('marks pauses between words in what the guesser reads, but not at the end', async () => {
    const guess = vi.fn<Guesser>(mockGuesser);
    const { session, say } = setup(guess);
    say('I need to go to the');
    vi.advanceTimersByTime(1500);
    say('the place where you get medicine');
    await vi.advanceTimersByTimeAsync(2500);
    const input = guess.mock.calls.at(-1)?.[0];
    expect(input?.stuckPhrase).toContain('to the … the place');
    expect(input?.conversation).toContain('to the … the place');
    expect(input?.stuckPhrase.endsWith('…')).toBe(false);
    expect(input?.conversation.endsWith('…')).toBe(false);
    session.close();
  });

  it('allows a better offer for the same stall after the user talked on past a wrong one', async () => {
    let calls = 0;
    const guess: Guesser = () => {
      calls++;
      const word = calls === 1 ? 'wrongword' : 'rightword';
      return Promise.resolve({
        candidates: [{ word, confidence: 0.9 }],
        abstain: false,
        latencyMs: 0,
      });
    };
    const { session, events, say } = setup(guess);
    say('I need to go to the');
    await vi.advanceTimersByTimeAsync(2000);
    const offered = () =>
      events.flatMap((e) => (e.type === 'guess.offered' ? [e.candidates[0]?.word] : []));
    expect(offered()).toEqual(['wrongword']);

    // They ignore it and describe what they mean; a second stall follows within the cooldown.
    say('the place where you get your tablets');
    await vi.advanceTimersByTimeAsync(100);
    say('from the man at the');
    await vi.advanceTimersByTimeAsync(2000);
    expect(events.some((e) => e.type === 'guess.withdrawn')).toBe(true);
    expect(offered()).toEqual(['wrongword', 'rightword']);
    session.close();
  });

  it('does not offer the same word again for a while', async () => {
    const guess: Guesser = () =>
      Promise.resolve({
        candidates: [{ word: 'hotfix', confidence: 0.9 }],
        abstain: false,
        latencyMs: 0,
      });
    const { session, events, say } = setup(guess);
    const offers = () => events.filter((e) => e.type === 'guess.offered').length;
    say('I would push a quick repair, an urgent fix, a');
    await vi.advanceTimersByTimeAsync(2000);
    expect(offers()).toBe(1);
    // Well past the 8 s cooldown, another pause; the old word must not come back.
    vi.advanceTimersByTime(30_000);
    say('so thanks everyone I will post my notes in the channel');
    await vi.advanceTimersByTimeAsync(2500);
    expect(offers()).toBe(1);
    session.close();
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

describe('session trace', () => {
  it('records words with speaker and times, the detector, the guess and the gate, without debug on', async () => {
    const records: Record<string, unknown>[] = [];
    const { session, say } = setup(mockGuesser, { trace: (r) => records.push(r) });
    say('I need to go to the the place where you get medicine');
    await vi.advanceTimersByTimeAsync(2000);
    const kinds = records.map((r) => r.kind ?? (r.event as { type: string }).type);
    expect(kinds).toEqual(
      expect.arrayContaining(['words', 'transcript', 'detector', 'guess', 'gate', 'guess.offered']),
    );
    const words = records.find((r) => r.kind === 'words')?.words as Word[];
    expect(words[0]).toMatchObject({ text: 'I', startMs: expect.any(Number) });
    expect(records.every((r) => typeof r.atMs === 'number')).toBe(true);
    session.close();
  });

  it('records nothing when no trace is set', () => {
    const { session, say, events } = setup();
    say('hello there');
    expect(events.some((e) => e.type === 'debug')).toBe(false);
    session.close();
  });
});

describe('escalation to a stronger guesser', () => {
  const abstainer: Guesser = () => Promise.resolve({ candidates: [], abstain: true, latencyMs: 0 });
  const unsure: Guesser = () =>
    Promise.resolve({
      candidates: [{ word: 'pharmasy', confidence: 0.3 }],
      abstain: false,
      latencyMs: 0,
    });
  const stronger = (word: string | undefined) =>
    vi.fn<Guesser>(() =>
      Promise.resolve(
        word
          ? { candidates: [{ word, confidence: 0.8 }], abstain: false, latencyMs: 0 }
          : { candidates: [], abstain: true, latencyMs: 0 },
      ),
    );
  const STALL = 'I need to go to the the place where you get medicine';
  const offers = (events: ServerEvent[]) => events.filter((e) => e.type === 'guess.offered').length;

  it('asks once on a confirmed stall the first guesser abstained on, and offers its word', async () => {
    const escalate = stronger('pharmacy');
    const { session, events, say } = setup(abstainer, { escalate });
    say(STALL);
    await vi.advanceTimersByTimeAsync(2500);
    expect(escalate).toHaveBeenCalledTimes(1);
    const offer = events.find((e) => e.type === 'guess.offered');
    expect(offer?.type === 'guess.offered' && offer.candidates[0]?.word).toBe('pharmacy');
    session.close();
  });

  it('also asks when the first guess is below the gate', async () => {
    const escalate = stronger('pharmacy');
    const { session, events, say } = setup(unsure, { escalate });
    say(STALL);
    await vi.advanceTimersByTimeAsync(2500);
    expect(escalate).toHaveBeenCalledTimes(1);
    expect(offers(events)).toBe(1);
    session.close();
  });

  it('does not ask when the first guess is confident enough', async () => {
    const escalate = stronger('knife');
    const { session, events, say } = setup(mockGuesser, { escalate });
    say(STALL);
    await vi.advanceTimersByTimeAsync(2500);
    expect(escalate).not.toHaveBeenCalled();
    expect(offers(events)).toBe(1);
    session.close();
  });

  it('stays silent when the stronger guesser abstains too', async () => {
    const escalate = stronger(undefined);
    const { session, events, say, types } = setup(abstainer, { escalate });
    say(STALL);
    await vi.advanceTimersByTimeAsync(2500);
    expect(escalate).toHaveBeenCalledTimes(1);
    expect(offers(events)).toBe(0);
    expect(types()).toContain('guess.idle');
    session.close();
  });

  it('does not ask on a bare pause, where the sentence is usually just finished', async () => {
    const escalate = stronger('amortisation');
    const { session, events, say } = setup(abstainer, { escalate });
    say('thank you I will send the numbers over today');
    await vi.advanceTimersByTimeAsync(3000);
    expect(escalate).not.toHaveBeenCalled();
    expect(offers(events)).toBe(0);
    session.close();
  });

  it('asks when the user asks by hand', async () => {
    const escalate = stronger('pharmacy');
    const { session, events, say } = setup(abstainer, { escalate });
    say('so the plan for the week is to go to the');
    session.handle({ type: 'stuck.manual' });
    await vi.advanceTimersByTimeAsync(2500);
    expect(escalate).toHaveBeenCalledTimes(1);
    expect(offers(events)).toBe(1);
    session.close();
  });

  it('never asks for an early guess, only once the stall is confirmed', async () => {
    const escalate = stronger('pharmacy');
    const { session, say } = setup(abstainer, { escalate, speculateAfterMs: 300 });
    say('so the plan for the week is to go to the shops');
    await vi.advanceTimersByTimeAsync(900);
    expect(escalate).not.toHaveBeenCalled();
    session.close();
  });

  it('does not ask after a failed call: the provider is struggling', async () => {
    const failing: Guesser = () =>
      Promise.resolve({ candidates: [], abstain: true, latencyMs: 0, error: true });
    const escalate = stronger('pharmacy');
    const { session, say } = setup(failing, { escalate });
    say(STALL);
    await vi.advanceTimersByTimeAsync(2500);
    expect(escalate).not.toHaveBeenCalled();
    session.close();
  });

  it('drops the answer if the speaker carries on while it is pending', async () => {
    let release: () => void = () => undefined;
    const slow = vi.fn<Guesser>(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              candidates: [{ word: 'pharmacy', confidence: 0.8 }],
              abstain: false,
              latencyMs: 0,
            });
        }),
    );
    const { session, events, say } = setup(abstainer, { escalate: slow });
    say(STALL);
    await vi.advanceTimersByTimeAsync(2000);
    expect(slow).toHaveBeenCalledTimes(1);
    say('actually never mind it was the post office');
    release();
    await vi.advanceTimersByTimeAsync(500);
    expect(offers(events)).toBe(0);
    session.close();
  });

  it('counts toward the call cap', async () => {
    const escalate = stronger('pharmacy');
    // One call allowed a minute: the first guess uses it, so there is none left to escalate with.
    const { session, say } = setup(abstainer, { escalate, maxCallsPerMinute: 1 });
    say(STALL);
    await vi.advanceTimersByTimeAsync(2500);
    expect(escalate).not.toHaveBeenCalled();
    session.close();
  });
});
