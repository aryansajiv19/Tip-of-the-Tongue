import { describe, expect, it } from 'vitest';
import {
  elapsedMs,
  formatClock,
  idleClock,
  pauseClock,
  resetClock,
  sessionMode,
  startClock,
} from './sessionState';

describe('clock', () => {
  it('is zero and stopped at the start', () => {
    expect(elapsedMs(idleClock, 5000)).toBe(0);
  });

  it('counts only while listening', () => {
    let c = startClock(idleClock, 1000);
    expect(elapsedMs(c, 4000)).toBe(3000);
    c = pauseClock(c, 4000);
    expect(elapsedMs(c, 60_000)).toBe(3000);
    c = startClock(c, 70_000);
    expect(elapsedMs(c, 72_000)).toBe(5000);
  });

  it('starting twice or pausing twice changes nothing', () => {
    const c = startClock(idleClock, 1000);
    expect(startClock(c, 2000)).toBe(c);
    const p = pauseClock(c, 3000);
    expect(pauseClock(p, 9000)).toBe(p);
  });

  it('never goes backwards if the clock does', () => {
    const c = startClock(idleClock, 5000);
    expect(elapsedMs(c, 4000)).toBe(0);
    expect(pauseClock(c, 4000).elapsedMs).toBe(0);
  });

  it('reset goes to zero and keeps running only if it was running', () => {
    const running = resetClock(startClock(idleClock, 1000), 6000);
    expect(running).toEqual({ elapsedMs: 0, startedAt: 6000 });
    expect(elapsedMs(running, 7500)).toBe(1500);
    const paused = resetClock(pauseClock(startClock(idleClock, 1000), 6000), 9000);
    expect(paused).toEqual({ elapsedMs: 0, startedAt: null });
  });
});

describe('formatClock', () => {
  it('shows mm:ss with leading zeros', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(999)).toBe('00:00');
    expect(formatClock(1000)).toBe('00:01');
    expect(formatClock(59_999)).toBe('00:59');
    expect(formatClock(60_000)).toBe('01:00');
    expect(formatClock(754_000)).toBe('12:34');
  });

  it('keeps counting minutes past an hour', () => {
    expect(formatClock(75 * 60_000 + 3000)).toBe('75:03');
    expect(formatClock(100 * 60_000)).toBe('100:00');
  });

  it('treats a negative as zero', () => {
    expect(formatClock(-5000)).toBe('00:00');
  });
});

describe('sessionMode', () => {
  it('is Everyday without a brief', () => {
    expect(sessionMode(null)).toBe('Everyday');
    expect(sessionMode('')).toBe('Everyday');
    expect(sessionMode('  \n ')).toBe('Everyday');
  });

  it('is Meeting once a brief is loaded', () => {
    expect(sessionMode('Q3 review with Northwind')).toBe('Meeting');
  });
});
