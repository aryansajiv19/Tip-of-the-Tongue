import { describe, expect, it } from 'vitest';
import { confidenceDots, statusLine } from './cardView';

describe('confidenceDots', () => {
  it.each([
    [0, 1],
    [0.45, 1],
    [0.64, 1],
    [0.65, 2],
    [0.84, 2],
    [0.85, 3],
    [1, 3],
  ])('%s fills %s dots', (confidence, dots) => expect(confidenceDots(confidence)).toBe(dots));

  it('never goes outside 1 to 3, even for odd values', () => {
    expect(confidenceDots(-5)).toBe(1);
    expect(confidenceDots(9)).toBe(3);
  });
});

describe('statusLine', () => {
  const ok = { connection: 'connected' as const, guesserDown: false };

  it('is nothing when all is well', () => expect(statusLine(ok)).toBeNull());

  it('shows one line, the most important first', () => {
    const all = {
      connection: 'reconnecting' as const,
      guesserDown: true,
    };
    expect(statusLine(all)).toMatch(/Not connected/);
    expect(statusLine({ ...all, connection: 'connected' })).toMatch(/unavailable/);
  });

  it('says another tab is listening', () => {
    expect(statusLine({ ...ok, connection: 'other-tab' })).toMatch(/Another tab/);
  });

  it('says nothing while the first connection is still being made', () => {
    expect(statusLine({ ...ok, connection: 'connecting' })).toBeNull();
  });
});
