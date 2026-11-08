import { describe, expect, it } from 'vitest';
import type { Guesser } from '../../server/src/guess/types.js';
import { layoutScenario } from './layout.js';
import { replay } from './replay.js';
import { scoreScenario } from './score.js';
import type { Scenario } from './scenarios.js';

// Knows one thing: "medicine" means pharmacy. Everything else it declines.
const pharmacyGuesser =
  (latencyMs = 0): Guesser =>
  (input) =>
    Promise.resolve(
      input.stuckPhrase.trim().endsWith('medicine')
        ? { candidates: [{ word: 'pharmacy', confidence: 0.9 }], abstain: false, latencyMs }
        : { candidates: [], abstain: true, latencyMs },
    );

const scenario = (lines: Scenario['lines']): Scenario => ({
  id: 't',
  type: 'x',
  split: 'dev',
  title: 't',
  lines,
});

describe('replay', () => {
  it('shows a pop-up for a stall by the user, attributed to that line, after the pause', async () => {
    const sc = scenario([
      { s: 'me', t: 'Hello there how are you today' },
      { s: 'other', t: 'Fine thanks' },
      { s: 'me', t: 'I need to go to the... place where you get medicine', w: 'pharmacy' },
      { s: 'me', t: 'pharmacy, yes' },
    ]);
    const placed = layoutScenario(sc);
    const { offers } = await replay(sc, placed, pharmacyGuesser());
    expect(offers).toHaveLength(1);
    expect(offers[0]?.line).toBe(2);
    expect(offers[0]?.silenceMs).toBeGreaterThanOrEqual(700);
    expect(scoreScenario('t', 'x', placed, offers).stalls[0]?.outcome).toBe('correct');
  });

  it('offers nothing in fluent speech, even with thinking pauses', async () => {
    const sc = scenario([
      { s: 'me', t: 'So I think... we should wait until Friday.' },
      { s: 'me', t: 'Well... that depends on the client.' },
    ]);
    expect((await replay(sc, layoutScenario(sc), pharmacyGuesser())).offers).toEqual([]);
  });

  it('attributes a pop-up caused by the other speaker to the other speaker', async () => {
    const sc = scenario([
      { s: 'me', t: 'Go on, I am listening' },
      { s: 'other', t: 'I need to go to the... place where you get medicine', gap: 2500 },
      { s: 'me', t: 'Of course' },
    ]);
    const placed = layoutScenario(sc);
    const { offers } = await replay(sc, placed, pharmacyGuesser());
    expect(offers.map((o) => o.line)).toEqual([1]);
    expect(scoreScenario('t', 'x', placed, offers).other.popups).toBe(1);
  });

  it('lets a slow guess take its time on the virtual clock', async () => {
    const sc = scenario([{ s: 'me', t: 'the... place where you get medicine', w: 'pharmacy' }]);
    const placed = layoutScenario(sc);
    const fast = await replay(sc, placed, pharmacyGuesser(0));
    const slow = await replay(sc, placed, pharmacyGuesser(3000));
    expect(slow.offers[0]?.silenceMs ?? 0).toBeGreaterThan(fast.offers[0]?.silenceMs ?? 0);
    expect(slow.offers[0]?.silenceMs ?? 0).toBeGreaterThanOrEqual(3000);
  });

  it('counts guess calls, including early ones', async () => {
    const sc = scenario([{ s: 'me', t: 'the... place where you get medicine', w: 'pharmacy' }]);
    const { guessCalls } = await replay(sc, layoutScenario(sc), pharmacyGuesser());
    expect(guessCalls).toBeGreaterThanOrEqual(1);
  });

  it('with voices labelled, stays silent for the other speaker and offers for the user', async () => {
    const sc = scenario([
      {
        s: 'me',
        t: 'Hello everyone thanks for joining I am going to walk you through the plan today',
      },
      { s: 'other', t: 'Sure go ahead' },
      { s: 'me', t: 'Okay that is the plan', gap: 5000 },
      { s: 'other', t: 'I need to go to the... place where you get medicine', gap: 2500 },
      { s: 'me', t: 'I need to go to the... place where you get medicine', gap: 2500 },
    ]);
    const placed = layoutScenario(sc, true);
    const { offers, speaker } = await replay(sc, placed, pharmacyGuesser());
    expect(speaker).toBe(0);
    expect(offers.map((o) => o.line)).toEqual([4]);
  });
});
