import { afterEach, describe, expect, it, vi } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import type { AddressInfo } from 'node:net';
import { createDeepgramStream } from './deepgram.js';

// Deepgram misbehaving the ways a real network does: dropping mid-sentence, refusing, going
// quiet, sending junk. Each test is a real WebSocket to a stand-in server.

const result = (text: string) =>
  JSON.stringify({
    type: 'Results',
    is_final: true,
    channel: {
      alternatives: [{ words: [{ word: text, punctuated_word: text, start: 0, end: 0.4 }] }],
    },
  });

const toClose: { close: () => void }[] = [];
afterEach(() => {
  vi.useRealTimers();
  for (const c of toClose.splice(0)) c.close();
});

async function standIn(
  options: ConstructorParameters<typeof WebSocketServer>[0] = {},
  onConnection: (ws: WebSocket, index: number) => void = () => undefined,
) {
  const wss = new WebSocketServer({ port: 0, ...options });
  await new Promise<void>((r) => wss.once('listening', () => r()));
  toClose.push(wss);
  let connections = 0;
  wss.on('connection', (ws) => onConnection(ws, connections++));
  const url = `ws://127.0.0.1:${(wss.address() as AddressInfo).port}`;
  return { wss, url, connections: () => connections };
}

function client(
  url: string,
  clock: { t: number },
  extra: Partial<Parameters<typeof createDeepgramStream>[0]> = {},
) {
  const events: { type: string; words: { text: string }[] }[] = [];
  const errors: Error[] = [];
  let attempts = 0;
  const stream = createDeepgramStream({
    apiKey: 'k',
    language: 'en',
    now: () => clock.t,
    connect: () => {
      attempts++;
      return new WebSocket(url);
    },
    onEvent: (e) => events.push(e),
    onError: (e) => errors.push(e),
    ...extra,
  });
  toClose.push({ close: stream.close });
  return { stream, events, errors, attempts: () => attempts };
}

const audio = Buffer.alloc(3200);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('a connection that drops mid-sentence', () => {
  it('is opened again by the next audio, without falling back or losing later words', async () => {
    const dg = await standIn({}, (ws, i) => {
      ws.on('message', () => {
        ws.send(result(i === 0 ? 'before' : 'after'));
        if (i === 0) setTimeout(() => ws.terminate(), 20); // the network goes
      });
    });
    const clock = { t: 10_000 };
    const c = client(dg.url, clock);

    c.stream.send(audio);
    await expect.poll(() => c.events.length).toBe(1);
    await sleep(100); // the drop reaches the client
    clock.t += 1500; // past the first wait
    c.stream.send(audio);
    await expect.poll(() => c.events.length).toBe(2);

    expect(c.events.map((e) => e.words[0]?.text)).toEqual(['before', 'after']);
    expect(dg.connections()).toBe(2);
    expect(c.errors).toEqual([]);
  });

  it('survives a close with a server error code the same way', async () => {
    const dg = await standIn({}, (ws, i) => {
      ws.on('message', () => {
        if (i === 0) ws.close(1011, 'internal error');
        else ws.send(result('back'));
      });
    });
    const clock = { t: 0 };
    const c = client(dg.url, clock);
    c.stream.send(audio);
    await expect.poll(() => dg.connections()).toBe(1);
    await sleep(100);
    clock.t += 1500;
    c.stream.send(audio);
    await expect.poll(() => c.events.length).toBe(1);
    expect(c.errors).toEqual([]);
  });
});

describe('a connection that closes at once', () => {
  it('is not opened again ten times a second: it counts as a failure, with waits, then gives up once', async () => {
    const dg = await standIn({}, (ws) => ws.close(1011, 'internal error'));
    const clock = { t: 0 };
    const closes: number[] = [];
    const c = client(dg.url, clock, { onUnexpectedClose: (code) => closes.push(code) });
    for (let i = 0; i < 10; i++) {
      c.stream.send(audio);
      await sleep(30);
    }
    expect(dg.connections()).toBe(1);
    for (const wait of [1000, 2000, 4000]) {
      clock.t += wait;
      c.stream.send(audio);
      await sleep(100);
    }
    await expect.poll(() => c.errors.length).toBe(1);
    expect(dg.connections()).toBe(4);
    expect(c.errors[0]?.message).toContain('1011');
    expect(closes).toEqual([1011, 1011, 1011, 1011]);
  });

  it('is opened again at once when it had been working for a while', async () => {
    const sockets: WebSocket[] = [];
    const dg = await standIn({}, (ws) => sockets.push(ws));
    const clock = { t: 0 };
    const closes: [number, number][] = [];
    const c = client(dg.url, clock, { onUnexpectedClose: (code, ms) => closes.push([code, ms]) });
    c.stream.send(audio);
    await expect.poll(() => sockets.length).toBe(1);
    await sleep(50);
    clock.t += 20_000;
    sockets[0]?.close(1011, 'idle');
    await expect.poll(() => closes.length).toBe(1);
    expect(closes[0]?.[0]).toBe(1011);
    expect(closes[0]?.[1]).toBeGreaterThanOrEqual(10_000);
    c.stream.send(audio); // no wait: it worked
    await expect.poll(() => sockets.length).toBe(2);
    expect(c.errors).toEqual([]);
  });
});

describe('after giving up', () => {
  const giveUp = async (c: ReturnType<typeof client>, clock: { t: number }) => {
    c.stream.send(audio);
    for (const wait of [1000, 2000, 4000]) {
      await sleep(100);
      clock.t += wait;
      c.stream.send(audio);
    }
    await expect.poll(() => c.errors.length).toBe(1);
  };

  it('asks again by itself, reports the recovery once, and works from the next audio', async () => {
    let refuse = true;
    const dg = await standIn(
      { verifyClient: (_i, cb) => (refuse ? cb(false, 503, 'busy') : cb(true)) },
      (ws) => ws.on('message', (_d, isBinary) => isBinary && ws.send(result('hello'))),
    );
    const clock = { t: 0 };
    let recovered = 0;
    const c = client(dg.url, clock, { recoverAfterMs: 60, onRecovered: () => recovered++ });
    await giveUp(c, clock);
    const attempts = c.attempts();
    await expect.poll(() => c.attempts()).toBeGreaterThan(attempts + 1); // still looking
    expect(recovered).toBe(0);
    expect(c.errors).toHaveLength(1); // and not reporting it again

    refuse = false;
    await expect.poll(() => recovered).toBe(1);
    c.stream.send(audio);
    await expect.poll(() => c.events.length).toBe(1);
    await sleep(200);
    expect(recovered).toBe(1);
  });

  it('stops asking when the stream is closed', async () => {
    const dg = await standIn({ verifyClient: (_i, cb) => cb(false, 503, 'busy') });
    const clock = { t: 0 };
    const c = client(dg.url, clock, { recoverAfterMs: 40 });
    await giveUp(c, clock);
    c.stream.close();
    await sleep(100);
    const attempts = c.attempts();
    await sleep(200);
    expect(c.attempts()).toBe(attempts);
  });

  it('does not ask again after a refused key', async () => {
    const dg = await standIn({ verifyClient: (_i, cb) => cb(false, 401, 'Unauthorized') });
    const c = client(dg.url, { t: 0 }, { recoverAfterMs: 40 });
    c.stream.send(audio);
    await expect.poll(() => c.errors.length).toBe(1);
    await sleep(250);
    expect(c.attempts()).toBe(1);
  });
});

describe('Deepgram refusing or unreachable', () => {
  it('gives up at once on a refused key (401) and never asks again', async () => {
    const dg = await standIn({ verifyClient: (_i, cb) => cb(false, 401, 'Unauthorized') });
    const clock = { t: 0 };
    const c = client(dg.url, clock);
    c.stream.send(audio);
    await expect.poll(() => c.errors.length).toBe(1);
    expect(c.errors[0]?.message).toContain('401');
    for (let i = 0; i < 5; i++) {
      clock.t += 10_000;
      c.stream.send(audio);
    }
    expect(c.attempts()).toBe(1);
  });

  it('tries a busy Deepgram (503) three more times, waiting between, then gives up once', async () => {
    const dg = await standIn({ verifyClient: (_i, cb) => cb(false, 503, 'busy') });
    const clock = { t: 0 };
    const c = client(dg.url, clock);

    c.stream.send(audio);
    await expect.poll(() => c.attempts()).toBe(1);
    await sleep(150);
    // Inside the wait: nothing is opened, however much audio comes.
    for (let i = 0; i < 10; i++) c.stream.send(audio);
    expect(c.attempts()).toBe(1);

    for (const wait of [1000, 2000, 4000]) {
      clock.t += wait;
      c.stream.send(audio);
      await sleep(150);
    }
    await expect.poll(() => c.errors.length).toBe(1);
    expect(c.attempts()).toBe(4);
    clock.t += 60_000;
    c.stream.send(audio);
    expect(c.attempts()).toBe(4);
    expect(c.errors).toHaveLength(1);
  });

  it('counts retries from the last good connection, not for the whole session', async () => {
    let refuse = false;
    const dg = await standIn(
      { verifyClient: (_i, cb) => (refuse ? cb(false, 503, 'busy') : cb(true)) },
      (ws) => ws.on('message', (_d, isBinary) => isBinary && ws.send(result('hi'))),
    );
    const clock = { t: 0 };
    const c = client(dg.url, clock);
    // Two blips a while apart, each followed by a good connection: never gives up.
    for (let round = 0; round < 3; round++) {
      refuse = true;
      c.stream.close();
      c.stream.send(audio);
      await sleep(150);
      refuse = false;
      clock.t += 1500;
      c.stream.send(audio);
      await expect.poll(() => c.events.length).toBe(round + 1);
    }
    expect(c.errors).toEqual([]);
  });
});

describe('a connection that goes quiet without closing', () => {
  it('is dropped after twelve seconds of nothing, and replaced by the next audio', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    // Does not answer pings, as a half-dead link would not.
    const dg = await standIn({ autoPong: false } as never, (ws, i) => {
      if (i > 0) ws.on('message', () => ws.send(result('alive')));
    });
    const clock = { t: 0 };
    const c = client(dg.url, clock);
    c.stream.send(audio);
    await expect.poll(() => dg.connections()).toBe(1);
    await sleep(100);

    for (let s = 0; s < 17; s += 1) {
      clock.t += 1000;
      vi.advanceTimersByTime(1000);
    }
    await sleep(100);
    clock.t += 1500;
    c.stream.send(audio);
    await expect.poll(() => c.events.length).toBe(1);
    expect(dg.connections()).toBe(2);
    expect(c.errors).toEqual([]);
  });

  it('is left alone while it keeps answering, even with no transcript', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const dg = await standIn();
    const clock = { t: 0 };
    const c = client(dg.url, clock);
    c.stream.send(audio);
    await expect.poll(() => dg.connections()).toBe(1);
    await sleep(100);
    for (let s = 0; s < 60; s += 1) {
      clock.t += 1000;
      vi.advanceTimersByTime(1000);
      await sleep(5); // the pong arrives
    }
    c.stream.send(audio);
    await sleep(100);
    expect(dg.connections()).toBe(1);
  });
});

describe('junk from Deepgram', () => {
  it('ignores what is not a transcript and keeps handling what is', async () => {
    const dg = await standIn({}, (ws) => {
      ws.on('message', () => {
        ws.send('not json at all');
        ws.send(Buffer.from([1, 2, 3]), { binary: true });
        for (const junk of ['null', '[]', '42', '"Results"', '{}', '{"type":"Results"}']) {
          ws.send(junk);
        }
        ws.send(
          JSON.stringify({
            type: 'Results',
            is_final: true,
            channel: { alternatives: [{ words: [{ word: 'x', start: 'soon', end: null }] }] },
          }),
        );
        ws.send(JSON.stringify({ type: 'Metadata', request_id: 'r' }));
        ws.send(result('real'));
      });
    });
    const c = client(dg.url, { t: 0 });
    c.stream.send(audio);
    await expect.poll(() => c.events.length).toBe(1);
    await sleep(100);
    expect(c.events.map((e) => e.words[0]?.text)).toEqual(['real']);
    expect(c.errors).toEqual([]);
  });
});
