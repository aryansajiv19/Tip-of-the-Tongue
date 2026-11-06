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
