import { describe, expect, it } from 'vitest';
import { backoffMs, parseServerEvent } from './protocol';

describe('parseServerEvent', () => {
  it('parses known events', () => {
    const e = { type: 'guess.expired', id: 'x' };
    expect(parseServerEvent(JSON.stringify(e))).toEqual(e);
  });

  it('parses guesser.status', () => {
    const e = { type: 'guesser.status', ok: false };
    expect(parseServerEvent(JSON.stringify(e))).toEqual(e);
  });

  it.each([
    ['not json', 'nope'],
    ['json null', 'null'],
    ['a number', '5'],
    ['an array', '[]'],
    ['no type', '{"id":"x"}'],
    ['unknown type', '{"type":"hello"}'],
    ['non-string type', '{"type":1}'],
    ['empty', ''],
  ])('returns null for %s', (_n, data) => {
    expect(parseServerEvent(data)).toBeNull();
  });

  it('returns null for binary data', () => {
    expect(parseServerEvent(new ArrayBuffer(2))).toBeNull();
    expect(parseServerEvent(undefined)).toBeNull();
  });
});

describe('backoffMs', () => {
  it('doubles and caps at 15 s', () => {
    expect([0, 1, 2, 3, 4, 5, 10, 100].map(backoffMs)).toEqual([
      1000, 2000, 4000, 8000, 15000, 15000, 15000, 15000,
    ]);
  });

  it('treats negative attempts as the first', () => {
    expect(backoffMs(-3)).toBe(1000);
  });
});

describe('parseServerEvent: debug', () => {
  it('parses debug events', () => {
    const e = {
      type: 'debug',
      atMs: 1,
      info: { kind: 'gate', offered: false, reason: 'cooldown' },
    };
    expect(parseServerEvent(JSON.stringify(e))).toEqual(e);
  });
});
