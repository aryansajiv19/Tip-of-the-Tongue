import { describe, expect, it } from 'vitest';
import { checkKey } from './keyCheck';

const answering =
  (status: number, seen: { url?: string; headers?: unknown } = {}): typeof fetch =>
  (url, init) => {
    seen.url = String(url);
    seen.headers = init?.headers;
    return Promise.resolve(new Response('{}', { status }));
  };

describe('checkKey', () => {
  it('is missing without calling anyone when there is no key', async () => {
    const never: typeof fetch = () => {
      throw new Error('should not be called');
    };
    expect(await checkKey('anthropic', undefined, never)).toBe('missing');
    expect(await checkKey('deepgram', '', never)).toBe('missing');
  });

  it('sends each key to its own provider only, in that provider’s header', async () => {
    const a: { url?: string; headers?: unknown } = {};
    const d: { url?: string; headers?: unknown } = {};
    expect(await checkKey('anthropic', 'KEY-A-12345', answering(200, a))).toBe('ok');
    expect(await checkKey('deepgram', 'KEY-D-12345', answering(200, d))).toBe('ok');
    expect(new URL(a.url ?? '').host).toBe('api.anthropic.com');
    expect(a.headers).toMatchObject({ 'x-api-key': 'KEY-A-12345' });
    expect(new URL(d.url ?? '').host).toBe('api.deepgram.com');
    expect(d.headers).toEqual({ Authorization: 'Token KEY-D-12345' });
  });

  it.each([401, 403])('is invalid when the provider answers %i', async (status) => {
    expect(await checkKey('anthropic', 'k'.repeat(12), answering(status))).toBe('invalid');
  });

  it.each([429, 500, 503, 404])('says nothing about the key on %i', async (status) => {
    expect(await checkKey('deepgram', 'k'.repeat(12), answering(status))).toBe('unreachable');
  });

  it('is unreachable when the network fails or times out', async () => {
    const offline: typeof fetch = () => Promise.reject(new TypeError('fetch failed'));
    expect(await checkKey('anthropic', 'k'.repeat(12), offline)).toBe('unreachable');
    const hang: typeof fetch = (_u, init) =>
      new Promise((_r, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
      );
    expect(await checkKey('deepgram', 'k'.repeat(12), hang, 20)).toBe('unreachable');
  });

  it('never puts the key in the result', async () => {
    const result = await checkKey('anthropic', 'SECRET-KEY-123', answering(401));
    expect(result).not.toContain('SECRET');
  });
});
