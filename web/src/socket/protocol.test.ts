import { describe, expect, it } from 'vitest';
import { backoffMs, parseServerEvent, SILENT_MS, silentFor, socketUrl } from './protocol';

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

describe('silentFor', () => {
  it('is false while the server is heard within 40 s, true after', () => {
    expect(silentFor(1000, 1000 + SILENT_MS)).toBe(false);
    expect(silentFor(1000, 1001 + SILENT_MS)).toBe(true);
  });
  it('parses the heartbeat', () => {
    expect(parseServerEvent('{"type":"heartbeat"}')).toEqual({ type: 'heartbeat' });
  });
});

describe('socketUrl', () => {
  const page = (search: string, protocol = 'http:') => ({
    protocol,
    host: '127.0.0.1:4000',
    search,
  });

  it('is the plain /ws address with no token', () => {
    expect(socketUrl(page(''))).toBe('ws://127.0.0.1:4000/ws');
    expect(socketUrl(page('?debug=1'))).toBe('ws://127.0.0.1:4000/ws');
  });

  it('passes the page’s token on, and only the token', () => {
    expect(socketUrl(page('?token=XYZ&debug=1'))).toBe('ws://127.0.0.1:4000/ws?token=XYZ');
  });

  it('encodes the token, and ignores an empty one', () => {
    expect(socketUrl(page('?token=a%26b%3Dc'))).toBe('ws://127.0.0.1:4000/ws?token=a%26b%3Dc');
    expect(socketUrl(page('?token='))).toBe('ws://127.0.0.1:4000/ws');
  });

  it('uses wss on https', () => {
    expect(socketUrl(page('?token=T', 'https:'))).toBe('wss://127.0.0.1:4000/ws?token=T');
  });
});
