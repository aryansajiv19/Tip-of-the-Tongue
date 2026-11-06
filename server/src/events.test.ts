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
