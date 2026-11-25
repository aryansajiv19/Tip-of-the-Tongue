import { describe, expect, it } from 'vitest';
import { greeting, lastWord, timeLabel, wordStats } from './homeView';

describe('greeting', () => {
  it('follows the time of day, including the small hours', () => {
    expect(greeting(2)).toBe('Hello');
    expect(greeting(5)).toBe('Good morning');
    expect(greeting(11)).toBe('Good morning');
    expect(greeting(12)).toBe('Good afternoon');
    expect(greeting(17)).toBe('Good afternoon');
    expect(greeting(18)).toBe('Good evening');
    expect(greeting(23)).toBe('Good evening');
  });
});

describe('timeLabel', () => {
  it('shows hours and minutes only', () => {
    const at = new Date(2026, 10, 25, 16, 7, 42).getTime();
    expect(timeLabel(at, 'en-GB')).toBe('16:07');
    expect(timeLabel(at, 'en-US')).toMatch(/^4:07\sPM$/);
  });
});

describe('wordStats', () => {
  it('counts offered and used words', () => {
    expect(wordStats([])).toEqual({ offered: 0, used: 0 });
    expect(
      wordStats([
        { word: 'whisk', accepted: true, at: 1 },
        { word: 'ladle', accepted: false, at: 1 },
        { word: 'sieve', accepted: true, at: 1 },
      ]),
    ).toEqual({ offered: 3, used: 2 });
  });
});

describe('lastWord', () => {
  it('prefers the newest word taken, else the newest offered', () => {
    const offered = { word: 'ladle', accepted: false, at: 3 };
    const taken = { word: 'whisk', accepted: true, at: 2 };
    expect(lastWord([offered, taken])).toBe(taken);
    expect(lastWord([offered])).toBe(offered);
    expect(lastWord([])).toBeUndefined();
  });
});
