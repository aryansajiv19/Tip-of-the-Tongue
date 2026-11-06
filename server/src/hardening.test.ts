import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildApp } from './app.js';
import type { ServerEvent } from './events.js';
import type { Guesser } from './guess/types.js';
import { mockGuesser } from './guess/mock.js';

process.env.LOG_LEVEL = 'silent';

const ALLOWED = 'http://localhost:5173';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The guesser behaves per phrase so one server covers every case.
const guess: Guesser = async (input) => {
  if (input.stuckPhrase.endsWith('explode')) throw new Error('guesser broke its contract');
  if (input.conversation.includes('slowly')) {
    await sleep(300);
  }
  return mockGuesser(input);
};

let app: Awaited<ReturnType<typeof buildApp>>;
let base: string;

beforeAll(async () => {
  app = await buildApp({
    guess,
    allowedOrigins: [ALLOWED],
    session: { pauseMs: 100, cooldownMs: 0 },
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  base = `127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
afterAll(() => app.close());

function connect(origin?: string): Promise<{ ws: WebSocket; events: ServerEvent[] }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${base}/ws`, origin ? { headers: { Origin: origin } } : {});
    const events: ServerEvent[] = [];
    ws.on('message', (m) => events.push(JSON.parse(m.toString()) as ServerEvent));
    ws.on('error', reject);
    ws.on('open', () => resolve({ ws, events }));
  });
}

const health = async () => (await fetch(`http://${base}/health`)).json();
const words = (text: string, start = Date.now() - 2000) =>
  text
    .split(' ')
    .map((t, i) => ({ text: t, startMs: start + i * 100, endMs: start + i * 100 + 80 }));
const final = (text: string) => JSON.stringify({ type: 'transcript.final', words: words(text) });
const closed = (ws: WebSocket) => new Promise<void>((r) => ws.on('close', () => r()));

describe('origin check', () => {
  it('accepts an allowed origin and a missing one', async () => {
    for (const origin of [ALLOWED, undefined]) {
      const { ws } = await connect(origin);
      ws.close();
    }
  });

  it('rejects a disallowed origin however the path is spelled', async () => {
    for (const path of ['/%77s', '/ws?x=1', '/ws?']) {
      const ws = new WebSocket(`ws://${base}${path}`, {
        headers: { Origin: 'http://evil.example' },
      });
      const outcome = await new Promise<string>((resolve) => {
        ws.on('open', () => resolve('open'));
        ws.on('error', (e) => resolve(e.message));
      });
      expect(outcome, path).not.toBe('open');
    }
  });

  it('rejects other origins', async () => {
    await expect(connect('http://evil.example')).rejects.toThrow(/403/);
    await expect(connect('null')).rejects.toThrow(/403/);
    await expect(connect('http://localhost:5173.evil.example')).rejects.toThrow(/403/);
    expect(await health()).toEqual({ ok: true });
  });
});

describe('bad input never crashes the server', () => {
  it('survives junk messages and keeps working afterwards', async () => {
    const { ws, events } = await connect();
    const junk: (string | Buffer)[] = [
      'not json',
      '',
      '{',
      'null',
      '[]',
      '"string"',
      '42',
      '{"type":"nope"}',
      '{"type":"transcript.final"}',
      '{"type":"transcript.final","words":"x"}',
      '{"type":"transcript.final","words":[null]}',
      '{"type":"transcript.final","words":[{"text":"a","startMs":"0","endMs":1}]}',
      '{"type":"transcript.final","words":[{"text":"a","startMs":1e999,"endMs":1}]}',
      '{"type":"transcript.final","words":[{"text":"","startMs":0,"endMs":1}]}',
      '{"type":"session.brief","text":5}',
      '{"__proto__":{"polluted":true},"type":"session.brief","text":"x"}',
      Buffer.from([0xff, 0xfe, 0x00]),
    ];
    for (const m of junk) ws.send(m);
    ws.send(final('hello there.'));
    await sleep(100);
    expect(events.filter((e) => e.type !== 'session.ready')).toEqual([]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    ws.close();
    expect(await health()).toEqual({ ok: true });
  });

  it('accepts negative, zero, reversed and out-of-order timestamps without crashing', async () => {
    const { ws } = await connect();
    const w = (text: string, startMs: number, endMs: number) => ({ text, startMs, endMs });
    for (const list of [
      [w('the', -500, -400), w('thing', -1e12, 1e12)],
      [w('a', 100, 50), w('b', 0, 0)],
      [w('to', 5000, 5100), w('go', 0, 100), w('the', 2500, 2600)],
      [],
    ]) {
      ws.send(JSON.stringify({ type: 'transcript.partial', words: list }));
      ws.send(JSON.stringify({ type: 'transcript.final', words: list }));
    }
    await sleep(500);
    ws.close();
    expect(await health()).toEqual({ ok: true });
  });

  it('drops oversized events and closes an oversized frame', async () => {
    const { ws, events } = await connect();
    const tooManyWords = Array.from({ length: 301 }, (_, i) => ({
      text: 'w',
      startMs: i,
      endMs: i + 1,
    }));
    ws.send(JSON.stringify({ type: 'transcript.final', words: tooManyWords }));
    ws.send(JSON.stringify({ type: 'transcript.final', words: words('x'.repeat(101)) }));
    await sleep(100);
    expect(events.filter((e) => e.type !== 'session.ready')).toEqual([]);

    const done = closed(ws);
    ws.send('x'.repeat(200 * 1024));
    await done;
    expect(await health()).toEqual({ ok: true });
  });

  it('survives 10,000 rapid messages', async () => {
    const { ws } = await connect();
    for (let i = 0; i < 10_000; i++) ws.send(i % 2 ? 'junk' : final(`word${i}`));
    await sleep(500);
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
    expect(await health()).toEqual({ ok: true });
  }, 20_000);

  it('handles 50 concurrent connections, each getting its own offers', async () => {
    const clients = await Promise.all(Array.from({ length: 50 }, () => connect()));
    for (const { ws } of clients)
      ws.send(final('I need to go to the place where you get medicine'));
    await sleep(1200);
    for (const { events } of clients) {
      expect(events.map((e) => e.type)).toContain('guess.offered');
    }
    for (const { ws } of clients) ws.close();
    expect(await health()).toEqual({ ok: true });
  }, 20_000);
});

describe('guesser trouble', () => {
  it('survives a client that disconnects while a guess is pending', async () => {
    const { ws } = await connect();
    ws.send(final('I need the thing slowly'));
    await sleep(250);
    ws.terminate();
    await sleep(500);
    expect(await health()).toEqual({ ok: true });
  });

  it('stays silent and keeps going when the guesser rejects', async () => {
    const { ws, events } = await connect();
    ws.send(final('I need the thing explode'));
    await sleep(600);
    expect(events.map((e) => e.type).filter((t) => t !== 'session.ready')).toEqual([
      'stuck.detected',
    ]);
    // The same connection still works afterwards.
    ws.send(final('okay so now I need to go to the place where you get medicine'));
    await sleep(800);
    expect(events.map((e) => e.type)).toContain('guess.offered');
    ws.close();
    expect(await health()).toEqual({ ok: true });
  });
});
