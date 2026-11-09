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

// Deepgram counts time in the audio it was given. If audio went missing on the way, its times
// fall behind the clock, and every later word would look older than it is.
describe('audio that went missing before Deepgram', () => {
  const wordAt = (chunk: number) =>
    JSON.stringify({
      type: 'Results',
      is_final: true,
      channel: {
        alternatives: [
          {
            words: [
              {
                word: `w${chunk}`,
                punctuated_word: `w${chunk}`,
                start: chunk * 0.1,
                end: (chunk + 1) * 0.1,
              },
            ],
          },
        ],
      },
    });
  const START = 10_000;

  async function setup() {
    const sockets: WebSocket[] = [];
    const dg = await standIn({}, (ws) => sockets.push(ws));
    const clock = { t: START };
    const c = client(dg.url, clock);
    const ends = () =>
      c.events.map((e) => (e as unknown as { words: { endMs: number }[] }).words[0]?.endMs);
    // One chunk of live audio, answered at once, 100 ms after the one before.
    let sent = 0;
    const live = async (chunks: number) => {
      for (let i = 0; i < chunks; i++) {
        c.stream.send(audio);
        await expect.poll(() => sockets.length).toBe(1);
        sockets[0]?.send(wordAt(sent++));
        await expect.poll(() => c.events.length).toBe(sent);
        clock.t += 100;
      }
    };
    return { c, clock, sockets, ends, live, sent: () => sent };
  }

  it('words after a gap keep the clock, and earlier words are not moved', async () => {
    const t = await setup();
    await t.live(5);
    t.clock.t += 2000; // 20 chunks never arrived
    await t.live(1);
    // Word i was said when chunk i arrived: START + 100 i, and the one after the gap at the clock.
    expect(t.ends()).toEqual(
      [0, 1, 2, 3, 4].map((i) => START + i * 100).concat(START + 500 + 2000),
    );
  });

  it('keeps the time of a word from before the gap that is reported after it', async () => {
    const t = await setup();
    // Chunks 0 to 4 are sent, but Deepgram has only answered the first three.
    for (let i = 0; i < 5; i++) {
      t.c.stream.send(audio);
      if (i < 3) await expect.poll(() => t.sockets.length).toBe(1);
      t.sockets[0]?.send(i < 3 ? wordAt(i) : '{}');
      t.clock.t += 100;
    }
    await expect.poll(() => t.c.events.length).toBe(3);
    t.clock.t += 2000; // the gap, then the next chunk (audio position 500)
    t.c.stream.send(audio);
    // Now the late answer for chunk 4, then the one for the chunk after the gap.
    t.sockets[0]?.send(wordAt(4));
    t.sockets[0]?.send(wordAt(5));
    await expect.poll(() => t.c.events.length).toBe(5);
    expect(t.ends().slice(3)).toEqual([START + 400, START + 500 + 2000]);
  });

  it('leaves words alone when audio is only a little early or late', async () => {
    const t = await setup();
    let sent = 0;
    for (const jitter of [0, 150, -150, 200, -200, 0]) {
      t.c.stream.send(audio);
      await expect.poll(() => t.sockets.length).toBe(1);
      t.sockets[0]?.send(wordAt(sent++));
      await expect.poll(() => t.c.events.length).toBe(sent);
      t.clock.t += 100 + jitter;
    }
    expect(t.ends()).toEqual([0, 1, 2, 3, 4, 5].map((i) => START + i * 100));
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
