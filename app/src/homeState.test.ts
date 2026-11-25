import { describe, expect, it } from 'vitest';
import { parseHomeCommand, parseRecent } from './homeState';

describe('parseRecent', () => {
  it('keeps a well-formed list and drops extra fields', () => {
    const list = [{ word: 'whisk', accepted: true, at: 1700000000000, extra: 'x' }];
    expect(parseRecent(list)).toEqual([{ word: 'whisk', accepted: true, at: 1700000000000 }]);
    expect(parseRecent([])).toEqual([]);
  });

  it('drops the whole message when any entry is wrong', () => {
    const good = { word: 'whisk', accepted: false, at: 1 };
    expect(parseRecent([good, { word: '', accepted: false, at: 1 }])).toBeUndefined();
    expect(parseRecent([good, { word: 'a', accepted: 'yes', at: 1 }])).toBeUndefined();
    expect(parseRecent([good, { word: 'a', accepted: true, at: NaN }])).toBeUndefined();
    expect(parseRecent([good, null])).toBeUndefined();
    expect(parseRecent([{ word: 'x'.repeat(101), accepted: true, at: 1 }])).toBeUndefined();
  });

  it('refuses anything that is not a short list', () => {
    expect(parseRecent('whisk')).toBeUndefined();
    expect(parseRecent({ word: 'whisk' })).toBeUndefined();
    expect(
      parseRecent(Array.from({ length: 31 }, () => ({ word: 'a', accepted: true, at: 1 }))),
    ).toBeUndefined();
  });
});

describe('parseHomeCommand', () => {
  it('accepts only the window commands', () => {
    expect(parseHomeCommand('toggle-listening')).toBe('toggle-listening');
    expect(parseHomeCommand('show-overlay')).toBe('show-overlay');
    expect(parseHomeCommand('manual')).toBeUndefined();
    expect(parseHomeCommand(undefined)).toBeUndefined();
  });
});
