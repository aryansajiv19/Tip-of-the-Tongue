import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildApp } from './app.js';
import type { ServerEvent } from './events.js';
import type { Guesser } from './guess/types.js';

process.env.LOG_LEVEL = 'error';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const slow: Guesser = async () => {
  await sleep(400);
  return { candidates: [{ word: 'pharmacy', confidence: 0.9 }], abstain: false, latencyMs: 400 };
};

async function start(guess: Guesser = slow) {
  const logs: string[] = [];
  const app = await buildApp({
    guess,
    logStream: { write: (l) => logs.push(l) },
    session: { pauseMs: 100, cooldownMs: 0, speculateAfterMs: 0 },
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const port = (app.server.address() as AddressInfo).port;
  const open = async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const events: ServerEvent[] = [];
    ws.on('message', (m) => events.push(JSON.parse(m.toString()) as ServerEvent));
    // The socket opens before the server's first message (session.ready) has arrived.
    await new Promise((r) => ws.once('message', r));
    return { ws, events };
  };
  return { app, open, logs };
}

const stall = () => {
  const t = Date.now() - 1500;
  return JSON.stringify({
    type: 'transcript.final',
    words: ['I', 'need', 'to', 'go', 'to', 'the'].map((text, i) => ({
      text,
      startMs: t + i * 100,
      endMs: t + i * 100 + 80,
    })),
  });
};

describe('two tabs or windows at once', () => {
  it('each has its own conversation: one resetting or stalling does not touch the other', async () => {
    const { app, open } = await start();
    const a = await open();
    const b = await open();
    a.ws.send(stall());
    await sleep(100);
    b.ws.send(JSON.stringify({ type: 'session.reset' }));
    await expect.poll(() => a.events.some((e) => e.type === 'guess.offered')).toBe(true);

    expect(a.events.some((e) => e.type === 'session.cleared')).toBe(false);
    expect(b.events.some((e) => e.type === 'guess.offered')).toBe(false);
    a.ws.close();
    b.ws.close();
    await app.close();
  });
});

describe('a browser that vanishes', () => {
  it('mid-guess: no errors, nothing sent to a dead socket, the server carries on', async () => {
    const { app, open, logs } = await start();
    const a = await open();
    a.ws.send(stall());
    await sleep(250); // the guess is running
    a.ws.terminate(); // the tab is killed, the laptop lid shut
    await sleep(700);
    expect(logs.filter((l) => /"level":(50|60)/.test(l))).toEqual([]);

    const b = await open();
    expect(b.events[0]).toMatchObject({ type: 'session.ready', guesser: 'claude' });
    b.ws.close();
    await app.close();
  });
});

describe('the server restarts while pages are open', () => {
  it('shuts down promptly, closing every open page, so a restart is never stuck waiting', async () => {
    const { app, open } = await start();
    const clients = await Promise.all([open(), open(), open()]);
    const closed = clients.map(({ ws }) => new Promise((r) => ws.once('close', r)));
    const t0 = Date.now();
    await app.close();
    await Promise.all(closed);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});
