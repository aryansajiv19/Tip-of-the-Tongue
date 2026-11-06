import { afterEach, describe, expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import type { AddressInfo } from 'node:net';
import { buildApp } from '../app.js';
import type { ServerEvent } from '../events.js';
import { mockGuesser } from '../guess/mock.js';
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
  });
});

// A stand-in for Deepgram: records what it receives and replies with scripted results.
async function fakeDeepgram(onAudio: (ws: WebSocket, chunk: Buffer) => void) {
  const wss = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => wss.once('listening', () => resolve()));
  const headers: (string | undefined)[] = [];
  wss.on('connection', (ws, req) => {
    headers.push(req.headers.authorization);
    ws.on('message', (data, isBinary) => {
      if (isBinary) onAudio(ws, data as Buffer);
    });
  });
  const port = (wss.address() as AddressInfo).port;
  const connect = (_url: string, apiKey: string) =>
    new WebSocket(`ws://127.0.0.1:${port}`, { headers: { Authorization: `Token ${apiKey}` } });
  return { wss, headers, connect };
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
