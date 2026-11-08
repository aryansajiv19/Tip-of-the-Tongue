import { describe, expect, it } from 'vitest';
import { ClientEventSchema } from './events.js';

const settings = (pauseMs: unknown) =>
  ClientEventSchema.safeParse({ type: 'session.settings', pauseMs }).success;

describe('session.settings', () => {
  it('accepts 800 to 5000 ms', () => {
    expect([800, 1500, 5000].map(settings)).toEqual([true, true, true]);
  });

  it('rejects out-of-range and non-number values', () => {
    expect([799, 5001, 0, -1, '1500', null, undefined, {}].map(settings)).toEqual(
      Array(8).fill(false),
    );
  });
});

describe('guess.picked', () => {
  const picked = (value: unknown) => ClientEventSchema.safeParse(value).success;

  it('needs an id and a word of sensible size', () => {
    expect(picked({ type: 'guess.picked', id: 'abc', word: 'pharmacy' })).toBe(true);
    expect(picked({ type: 'guess.picked', id: 'abc', word: '' })).toBe(false);
    expect(picked({ type: 'guess.picked', id: 'a'.repeat(65), word: 'x' })).toBe(false);
    expect(picked({ type: 'guess.picked', id: 'abc', word: 'x'.repeat(101) })).toBe(false);
    expect(picked({ type: 'guess.picked', id: 5, word: 'x' })).toBe(false);
    expect(picked({ type: 'guess.picked', word: 'x' })).toBe(false);
  });
});

describe('session.settings minConfidence', () => {
  const withConfidence = (minConfidence: unknown) =>
    ClientEventSchema.safeParse({ type: 'session.settings', pauseMs: 1500, minConfidence }).success;

  it('is optional and clamped to 0.3 to 0.9', () => {
    expect(settings(1500)).toBe(true);
    expect([0.3, 0.6, 0.9].map(withConfidence)).toEqual([true, true, true]);
    expect([0.29, 0.91, 0, 1, -1, '0.6', null].map(withConfidence)).toEqual(Array(7).fill(false));
  });
});

describe('session.brief', () => {
  const brief = (text: unknown) =>
    ClientEventSchema.safeParse({ type: 'session.brief', text }).success;

  it('accepts a pasted document of up to 50,000 characters', () => {
    expect(brief('x'.repeat(50_000))).toBe(true);
  });

  it('rejects one character more, and non-strings', () => {
    expect(brief('x'.repeat(50_001))).toBe(false);
    expect(brief(5)).toBe(false);
  });
});

describe('session.brief source', () => {
  const brief = (value: Record<string, unknown>) =>
    ClientEventSchema.safeParse({ type: 'session.brief', text: 'x', ...value }).success;

  it('is optional, a string, and at most 200 characters', () => {
    expect(brief({})).toBe(true);
    expect(brief({ source: 'agenda.pdf' })).toBe(true);
    expect(brief({ source: 'x'.repeat(200) })).toBe(true);
    expect(brief({ source: 'x'.repeat(201) })).toBe(false);
    expect(brief({ source: 5 })).toBe(false);
    expect(brief({ source: null })).toBe(false);
  });
});
