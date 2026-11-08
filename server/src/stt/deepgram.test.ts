import { afterEach, describe, expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import type { AddressInfo } from 'node:net';
import { buildApp } from '../app.js';
import type { ServerEvent } from '../events.js';
import { mockGuesser } from '../guess/mock.js';
import { ProfileSchema } from '../guess/profile.js';
import { createDeepgramStream, deepgramUrl, toTranscriptEvent } from './deepgram.js';

const results = (isFinal: boolean, words: [string, number, number][]) => ({
  type: 'Results',
  is_final: isFinal,
  channel: {
    alternatives: [
      {
        words: words.map(([w, start, end]) => ({
          word: w.replace(/[.,?!]/g, '').toLowerCase(),
          punctuated_word: w,
          start,
          end,
          confidence: 0.9,
        })),
      },
    ],
  },
});

describe('toTranscriptEvent', () => {
  it('maps Deepgram seconds onto epoch ms and keeps punctuation', () => {
    const event = toTranscriptEvent(results(true, [['Hello.', 0.5, 0.9]]), 1_000_000);
    expect(event).toEqual({
      type: 'transcript.final',
      words: [{ text: 'Hello.', startMs: 1_000_500, endMs: 1_000_900, confidence: 0.9 }],
    });
  });

  it('turns interim results into partials, including empty ones that clear the partial', () => {
    expect(toTranscriptEvent(results(false, [['the', 0, 0.2]]), 0)?.type).toBe(
      'transcript.partial',
    );
    expect(toTranscriptEvent(results(false, []), 0)).toEqual({
      type: 'transcript.partial',
      words: [],
    });
  });

  it('drops empty finals and anything that is not a Results message', () => {
    expect(toTranscriptEvent(results(true, []), 0)).toBeNull();
    expect(toTranscriptEvent({ type: 'Metadata' }, 0)).toBeNull();
    expect(toTranscriptEvent({ type: 'UtteranceEnd' }, 0)).toBeNull();
    expect(toTranscriptEvent('junk', 0)).toBeNull();
  });

  it('asks Deepgram for filler words, interim results and raw 16 kHz PCM', () => {
    const url = new URL(deepgramUrl('en'));
    expect(url.searchParams.get('filler_words')).toBe('true');
    expect(url.searchParams.get('interim_results')).toBe('true');
    expect(url.searchParams.get('encoding')).toBe('linear16');
    expect(url.searchParams.get('sample_rate')).toBe('16000');
    // A full stop at a stall would hide it from the detector.
    expect(url.searchParams.get('punctuate')).toBe('false');
  });

  it('adds one keyterm parameter per term, encoded, and none when there are no terms', () => {
    expect(new URL(deepgramUrl('en')).searchParams.has('keyterm')).toBe(false);
    const url = new URL(deepgramUrl('en', ['SOC 2', 'Corner Mart', 'R&D', 'naïve']));
    expect(url.searchParams.getAll('keyterm')).toEqual(['SOC 2', 'Corner Mart', 'R&D', 'naïve']);
    expect(url.searchParams.get('model')).toBe('nova-3');
    expect(deepgramUrl('en', ['R&D'])).toContain('keyterm=R%26D');
  });
});

// A stand-in for Deepgram: records what it receives and replies with scripted results.
async function fakeDeepgram(onAudio: (ws: WebSocket, chunk: Buffer) => void) {
  const wss = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => wss.once('listening', () => resolve()));
  const headers: (string | undefined)[] = [];
  const urls: string[] = [];
  wss.on('connection', (ws, req) => {
    headers.push(req.headers.authorization);
    ws.on('message', (data, isBinary) => {
      if (isBinary) onAudio(ws, data as Buffer);
    });
  });
  const port = (wss.address() as AddressInfo).port;
  const connect = (url: string, apiKey: string) => {
    urls.push(url);
    return new WebSocket(`ws://127.0.0.1:${port}`, {
      headers: { Authorization: `Token ${apiKey}` },
    });
  };
  return { wss, headers, urls, connect };
}

const servers: { close: () => void }[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

describe('createDeepgramStream', () => {
  it('buffers audio until connected, authenticates, and maps results to events', async () => {
    let replied = false;
    const dg = await fakeDeepgram((ws) => {
      if (replied) return;
      replied = true;
      ws.send(JSON.stringify(results(true, [['pharmacy', 1, 1.4]])));
    });
    servers.push(dg.wss);
    const events: unknown[] = [];
    const stream = createDeepgramStream({
      apiKey: 'test-key',
      language: 'en',
      connect: dg.connect,
      now: () => 10_000,
      onEvent: (e) => events.push(e),
      onError: (err) => {
        throw err;
      },
    });
    stream.send(Buffer.alloc(3200));
    await expect.poll(() => events.length).toBe(1);
    expect(dg.headers).toEqual(['Token test-key']);
    // Origin = arrival of the first chunk minus one chunk (100 ms).
    expect(events[0]).toMatchObject({
      type: 'transcript.final',
      words: [{ text: 'pharmacy', startMs: 10_900, endMs: 11_300 }],
    });
    stream.close();
  });

  it('opens a new stream with the new keyterms after restart, and not before', async () => {
    const dg = await fakeDeepgram(() => undefined);
    servers.push(dg.wss);
    let terms = ['Priya'];
    const stream = createDeepgramStream({
      apiKey: 'k',
      language: 'en',
      keyterms: () => terms,
      connect: dg.connect,
      onEvent: () => undefined,
      onError: (err) => {
        throw err;
      },
    });
    stream.send(Buffer.alloc(3200));
    await expect.poll(() => dg.wss.clients.size).toBe(1); // connected
    expect(dg.urls).toHaveLength(1);
    expect(new URL(dg.urls[0] ?? '').searchParams.getAll('keyterm')).toEqual(['Priya']);

    terms = ['Priya', 'SOC 2'];
    stream.send(Buffer.alloc(3200)); // same stream: terms cannot change mid-stream
    expect(dg.urls).toHaveLength(1);

    stream.restart();
    stream.send(Buffer.alloc(3200));
    await expect.poll(() => dg.urls.length).toBe(2);
    expect(new URL(dg.urls[1] ?? '').searchParams.getAll('keyterm')).toEqual(['Priya', 'SOC 2']);
    stream.close();
  });

  it('does not count closing a stream that is still connecting as a failure', async () => {
    const dg = await fakeDeepgram(() => undefined);
    servers.push(dg.wss);
    const errors: Error[] = [];
    const stream = createDeepgramStream({
      apiKey: 'k',
      language: 'en',
      connect: dg.connect,
      onEvent: () => undefined,
      onError: (err) => errors.push(err),
    });
    stream.send(Buffer.alloc(3200)); // starts connecting
    stream.restart(); // e.g. the brief changed right away
    await new Promise((r) => setTimeout(r, 200));
    expect(errors).toEqual([]);
    // And it still works afterwards.
    stream.send(Buffer.alloc(3200));
    await expect.poll(() => dg.urls.length).toBe(2);
    stream.close();
  });

  it('does nothing on restart when no stream is open', () => {
    let opened = 0;
    const stream = createDeepgramStream({
      apiKey: 'k',
      language: 'en',
      connect: () => {
        opened++;
        return new WebSocket('ws://127.0.0.1:1');
      },
      onEvent: () => undefined,
      onError: () => undefined,
    });
    stream.restart();
    expect(opened).toBe(0);
  });

  it('reports a refused connection once and then stops trying', async () => {
    const errors: Error[] = [];
    let attempts = 0;
    const stream = createDeepgramStream({
      apiKey: 'bad',
      language: 'en',
      connect: () => {
        attempts++;
        return new WebSocket('ws://127.0.0.1:1');
      },
      onEvent: () => undefined,
      onError: (err) => errors.push(err),
    });
    stream.send(Buffer.alloc(10));
    await expect.poll(() => errors.length).toBe(1);
    for (let i = 0; i < 20; i++) stream.send(Buffer.alloc(10));
    expect(attempts).toBe(1);
    stream.close();
  });
});

describe('server with Deepgram', () => {
  async function connectClient(deepgram: Parameters<typeof buildApp>[0]) {
    const app = await buildApp({ guess: mockGuesser, ...deepgram });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const port = (app.server.address() as AddressInfo).port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const events: ServerEvent[] = [];
    ws.on('message', (data) => events.push(JSON.parse(data.toString()) as ServerEvent));
    await new Promise((resolve) => ws.once('open', resolve));
    return { app, ws, events };
  }

  it('tells the browser to stream audio, and relays the transcript back', async () => {
    const dg = await fakeDeepgram((socket) =>
      socket.send(JSON.stringify(results(false, [['hello', 0, 0.3]]))),
    );
    servers.push(dg.wss);
    const { app, ws, events } = await connectClient({
      deepgram: { apiKey: 'k', language: 'en', connect: dg.connect },
    });
    await expect.poll(() => events[0]).toEqual({ type: 'session.ready', stt: 'deepgram' });
    ws.send(Buffer.alloc(3200));
    await expect.poll(() => events.some((e) => e.type === 'transcript.partial')).toBe(true);
    ws.close();
    await app.close();
  });

  it('words still in flight from Deepgram after a reset are not shown or used', async () => {
    let socket: WebSocket | undefined;
    const dg = await fakeDeepgram((ws) => (socket = ws));
    servers.push(dg.wss);
    const { app, ws, events } = await connectClient({
      deepgram: { apiKey: 'k', language: 'en', connect: dg.connect },
    });
    ws.send(Buffer.alloc(3200));
    await expect.poll(() => socket).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 50));

    ws.send(JSON.stringify({ type: 'session.reset' }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    // A late result for words spoken before the reset, then one for words spoken after it.
    socket?.send(JSON.stringify(results(true, [['old', 0, 0.02]])));
    socket?.send(JSON.stringify(results(true, [['fresh', 30, 30.2]])));
    await expect.poll(() => events.filter((e) => e.type === 'transcript.final').length).toBe(1);
    const final = events.find((e) => e.type === 'transcript.final');
    expect(final?.type === 'transcript.final' && final.words.map((w) => w.text)).toEqual(['fresh']);
    ws.close();
    await app.close();
  });

  it('teaches Deepgram the profile words, and the brief names once a brief is sent', async () => {
    const dg = await fakeDeepgram(() => undefined);
    servers.push(dg.wss);
    const profile = ProfileSchema.parse({ pets: { dog: 'Biscuit' } });
    const { app, ws } = await connectClient({
      profile,
      deepgram: { apiKey: 'k', language: 'en', connect: dg.connect },
    });
    const terms = (url: string | undefined) => new URL(url ?? '').searchParams.getAll('keyterm');

    ws.send(Buffer.alloc(3200));
    await expect.poll(() => dg.urls.length).toBe(1);
    expect(terms(dg.urls[0])).toEqual(['Biscuit']);

    ws.send(
      JSON.stringify({ type: 'session.brief', text: 'Review with Northwind and the SOC 2 audit.' }),
    );
    await new Promise((r) => setTimeout(r, 100)); // let the brief reach the session
    ws.send(Buffer.alloc(3200));
    await expect.poll(() => dg.urls.length).toBe(2);
    expect(terms(dg.urls[1])).toEqual(['Biscuit', 'Northwind', 'SOC 2']);
    ws.close();
    await app.close();
  });

  it('falls back to browser speech recognition when Deepgram fails', async () => {
    const { app, ws, events } = await connectClient({
      deepgram: { apiKey: 'k', language: 'en', connect: () => new WebSocket('ws://127.0.0.1:1') },
    });
    ws.send(Buffer.alloc(3200));
    await expect
      .poll(() => events.filter((e) => e.type === 'session.ready').map((e) => e.stt))
      .toEqual(['deepgram', 'browser']);
    ws.close();
    await app.close();
  });

  it('ignores audio and says "browser" when Deepgram is not configured', async () => {
    const { app, ws, events } = await connectClient({});
    ws.send(Buffer.alloc(3200));
    await expect.poll(() => events[0]).toEqual({ type: 'session.ready', stt: 'browser' });
    ws.close();
    await app.close();
  });
});
