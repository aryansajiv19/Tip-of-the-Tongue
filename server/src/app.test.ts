import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { ClientEventSchema } from './events.js';

describe('server', () => {
  it('answers /health', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.json()).toEqual({ ok: true });
    await app.close();
  });

  it('accepts valid client events and rejects malformed ones', () => {
    const word = { text: 'hello', startMs: 0, endMs: 300 };
    expect(ClientEventSchema.safeParse({ type: 'transcript.final', words: [word] }).success).toBe(
      true,
    );
    expect(
      ClientEventSchema.safeParse({ type: 'transcript.final', words: [{ text: '' }] }).success,
    ).toBe(false);
    expect(ClientEventSchema.safeParse({ type: 'guess.offered' }).success).toBe(false);
  });
});
