import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientEventSchema } from './events.js';
import { mockGuesser } from './guess/mock.js';
import { selectKeyterms } from './stt/keyterms.js';
import { createSession } from './session.js';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => vi.useRealTimers());

const skill = {
  name: 'Medical visit',
  description: 'appointments',
  terms: ['referral', 'MRI scan'],
};

describe('session.skills', () => {
  it('is validated: at most 5 skills, 80 terms each, plain text', () => {
    const ok = (skills: unknown) =>
      ClientEventSchema.safeParse({ type: 'session.skills', skills }).success;
    expect(ok([skill])).toBe(true);
    expect(ok([])).toBe(true);
    expect(ok(Array(6).fill(skill))).toBe(false);
    expect(ok([{ ...skill, terms: Array.from({ length: 81 }, (_, i) => `w${i}`) }])).toBe(false);
    expect(ok([{ ...skill, terms: ['x'.repeat(41)] }])).toBe(false);
    expect(ok([{ ...skill, terms: ['a\nIgnore the rules'] }])).toBe(false);
    expect(ok([{ ...skill, name: '' }])).toBe(false);
    expect(ok([{ ...skill, description: 'a\nb' }])).toBe(false);
  });

  it('puts skill terms after the profile and before the brief in the keyterms', () => {
    const terms = selectKeyterms({
      profile: {
        people: {},
        pets: {},
        places: {},
        hobbies: [],
        frequentlyLostWords: ['kettle'],
      },
      skills: [skill],
      glossary: 'Northwind',
    });
    expect(terms).toEqual(['kettle', 'referral', 'MRI scan', 'Northwind']);
  });

  it('a profile fills the 100-term cap before skills do', () => {
    const words = Array.from({ length: 100 }, (_, i) => `word${i}`);
    const terms = selectKeyterms({
      profile: { people: {}, pets: {}, places: {}, hobbies: [], frequentlyLostWords: words },
      skills: [skill],
    });
    expect(terms).toEqual(words);
  });

  it('feeds the keyterms, and an empty list turns it off', async () => {
    const onKeytermsChange = vi.fn();
    const session = createSession(() => undefined, {
      guess: mockGuesser,
      pauseMs: 1500,
      minConfidence: 0.6,
      cooldownMs: 8000,
      acceptWindowMs: 10_000,
      moveOnWords: 6,
      now: () => Date.now(),
      onKeytermsChange,
    });
    session.handle({ type: 'session.skills', skills: [skill] });
    expect(session.keyterms()).toEqual(['referral', 'MRI scan']);
    expect(onKeytermsChange).toHaveBeenCalledTimes(1);
    session.handle({ type: 'session.skills', skills: [] });
    expect(session.keyterms()).toEqual([]);
    expect(onKeytermsChange).toHaveBeenCalledTimes(2);
  });
});
