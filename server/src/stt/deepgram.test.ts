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
    expect(toTranscriptEvent({ type: 'ConfigureSuccess', keyterms: ['SOC 2'] }, 0)).toBeNull();
    expect(toTranscriptEvent({ type: 'ConfigureFailure', code: 'X' }, 0)).toBeNull();
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

  it('listens in the language asked for, and asks for filler words only in English', () => {
    for (const language of ['en', 'multi', 'es', 'fr', 'de', 'hi']) {
      const url = new URL(deepgramUrl(language));
      expect(url.searchParams.get('language')).toBe(language);
      expect(url.searchParams.get('filler_words')).toBe(language === 'en' ? 'true' : null);
    }
  });

  it('asks for speaker labels only when told to, and maps them onto the words', () => {
    expect(new URL(deepgramUrl('en')).searchParams.has('diarize')).toBe(false);
    expect(new URL(deepgramUrl('en', [], true)).searchParams.get('diarize')).toBe('true');
    const msg = results(true, [['hello', 0, 0.3]]);
    const word = msg.channel.alternatives[0]?.words[0];
    if (word) Object.assign(word, { speaker: 1 });
    expect(toTranscriptEvent(msg, 0)?.words[0]?.speaker).toBe(1);
    expect(toTranscriptEvent(results(true, [['hello', 0, 0.3]]), 0)?.words[0]).not.toHaveProperty(
      'speaker',
    );
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
  // Text messages from the client (Configure, CloseStream), and every audio chunk, in order.
  const messages: string[] = [];
  wss.on('connection', (ws, req) => {
    headers.push(req.headers.authorization);
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        messages.push('audio');
        onAudio(ws, data as Buffer);
      } else messages.push(data.toString());
    });
  });
  const port = (wss.address() as AddressInfo).port;
  const connect = (url: string, apiKey: string) => {
    urls.push(url);
    return new WebSocket(`ws://127.0.0.1:${port}`, {
      headers: { Authorization: `Token ${apiKey}` },
    });
  };
  return { wss, headers, urls, messages, connect };
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

  it('sends new keyterms on the running stream: no new connection, no lost audio, same speakers', async () => {
    const dg = await fakeDeepgram(() => undefined);
    servers.push(dg.wss);
    let terms = ['Priya'];
    let starts = 0;
    const stream = createDeepgramStream({
      apiKey: 'k',
      language: 'en',
      keyterms: () => terms,
      connect: dg.connect,
      onStreamStart: () => starts++,
      onEvent: () => undefined,
      onError: (err) => {
        throw err;
      },
    });
    stream.send(Buffer.alloc(3200));
    await expect.poll(() => dg.messages.length).toBe(1); // connected, first chunk delivered
    expect(new URL(dg.urls[0] ?? '').searchParams.getAll('keyterm')).toEqual(['Priya']);

    terms = ['Priya', 'SOC 2'];
    stream.send(Buffer.alloc(3200)); // the list is not sent until told
    stream.updateKeyterms();
    stream.send(Buffer.alloc(3200));
    await expect.poll(() => dg.messages.length).toBe(4);
    expect(dg.messages.map((m) => (m === 'audio' ? m : JSON.parse(m)))).toEqual([
      'audio',
      'audio',
      { type: 'Configure', keyterms: ['Priya', 'SOC 2'] },
      'audio',
    ]);
    expect(dg.urls).toHaveLength(1);
    expect(starts).toBe(1);
    stream.close();
  });

  it('applies a change made while the stream was still connecting, before any audio', async () => {
    const dg = await fakeDeepgram(() => undefined);
    servers.push(dg.wss);
    let terms = ['Priya'];
    const errors: Error[] = [];
    const stream = createDeepgramStream({
      apiKey: 'k',
      language: 'en',
      keyterms: () => terms,
      connect: dg.connect,
      onEvent: () => undefined,
      onError: (err) => errors.push(err),
    });
    stream.send(Buffer.alloc(3200)); // starts connecting, with ['Priya'] in the URL
    terms = ['Priya', 'Northwind'];
    stream.updateKeyterms(); // the brief changed right away
    await expect.poll(() => dg.messages.length).toBe(2);
    expect(JSON.parse(dg.messages[0] ?? '')).toEqual({
      type: 'Configure',
      keyterms: ['Priya', 'Northwind'],
    });
    expect(dg.messages[1]).toBe('audio');
    expect(dg.urls).toHaveLength(1);
    expect(errors).toEqual([]);
    stream.close();
  });

  it('sends nothing when the terms did not change while connecting', async () => {
    const dg = await fakeDeepgram(() => undefined);
    servers.push(dg.wss);
    const stream = createDeepgramStream({
      apiKey: 'k',
      language: 'en',
      keyterms: () => ['Priya'],
      connect: dg.connect,
      onEvent: () => undefined,
      onError: (err) => {
        throw err;
      },
    });
    stream.send(Buffer.alloc(3200));
    stream.updateKeyterms();
    await expect.poll(() => dg.messages.length).toBe(1);
    expect(dg.messages).toEqual(['audio']);
    stream.close();
  });

  it('reports a refused keyterm update by its code, and ignores a successful one', async () => {
    const dg = await fakeDeepgram((ws) => {
      ws.send(JSON.stringify({ type: 'ConfigureSuccess', keyterms: ['Priya'] }));
      ws.send(
        JSON.stringify({ type: 'ConfigureFailure', code: 'CONFIGURE_KEYTERM_LIMIT_EXCEEDED' }),
      );
    });
    servers.push(dg.wss);
    const failures: string[] = [];
    const events: unknown[] = [];
    const stream = createDeepgramStream({
      apiKey: 'k',
      language: 'en',
      connect: dg.connect,
      onEvent: (e) => events.push(e),
      onConfigureFailure: (code) => failures.push(code),
      onError: (err) => {
        throw err;
      },
    });
    stream.send(Buffer.alloc(3200));
    await expect.poll(() => failures).toEqual(['CONFIGURE_KEYTERM_LIMIT_EXCEEDED']);
    expect(events).toEqual([]);
    stream.close();
  });

  it('opens a new stream in the new language, and leaves the stream alone for the same one', async () => {
    const dg = await fakeDeepgram(() => undefined);
    servers.push(dg.wss);
    const stream = createDeepgramStream({
      apiKey: 'k',
      language: 'en',
      connect: dg.connect,
      onEvent: () => undefined,
      onError: (err) => {
        throw err;
      },
    });
    stream.send(Buffer.alloc(3200));
    await expect.poll(() => dg.wss.clients.size).toBe(1);
    stream.setLanguage('en');
    stream.send(Buffer.alloc(3200));
    expect(dg.urls).toHaveLength(1);

    stream.setLanguage('es');
    stream.send(Buffer.alloc(3200));
    await expect.poll(() => dg.urls.length).toBe(2);
    expect(new URL(dg.urls[1] ?? '').searchParams.get('language')).toBe('es');
    stream.setLanguage('hi');
    stream.send(Buffer.alloc(3200));
    await expect.poll(() => dg.urls.length).toBe(3);
    expect(new URL(dg.urls[2] ?? '').searchParams.get('language')).toBe('hi');
    stream.close();
  });

  it('does nothing when no stream is open', () => {
    let opened = 0;
    const stream = createDeepgramStream({
      apiKey: 'k',
      language: 'en',
      keyterms: () => ['Priya'],
      connect: () => {
        opened++;
        return new WebSocket('ws://127.0.0.1:1');
      },
      onEvent: () => undefined,
      onError: () => undefined,
    });
    stream.updateKeyterms();
    expect(opened).toBe(0);
  });

  it('tries a dead connection a few times, reports it once and then stops', async () => {
    const errors: Error[] = [];
    let attempts = 0;
    // Each look at the clock is five seconds later, so waits between tries pass at once.
    let t = 0;
    const stream = createDeepgramStream({
      apiKey: 'bad',
      language: 'en',
      now: () => (t += 5000),
      connect: () => {
        attempts++;
        return new WebSocket('ws://127.0.0.1:1');
      },
      onEvent: () => undefined,
      onError: (err) => errors.push(err),
    });
    for (let i = 0; i < 10 && errors.length === 0; i++) {
      stream.send(Buffer.alloc(10));
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(errors).toHaveLength(1);
    for (let i = 0; i < 20; i++) stream.send(Buffer.alloc(10));
    expect(attempts).toBe(4);
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
    await expect.poll(() => events[0]).toMatchObject({ type: 'session.ready', stt: 'deepgram' });
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
    // The reset travels on a different socket from Deepgram's results: wait until the server has
    // handled it, or a slow machine can deliver the late result first.
    await expect.poll(() => events.some((e) => e.type === 'session.cleared')).toBe(true);
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
    await expect.poll(() => dg.messages.filter((m) => m !== 'audio').length).toBe(1);
    expect(dg.urls).toHaveLength(1); // same stream
    expect(JSON.parse(dg.messages.find((m) => m !== 'audio') ?? '')).toEqual({
      type: 'Configure',
      keyterms: ['Biscuit', 'Northwind', 'SOC 2'],
    });
    ws.close();
    await app.close();
  });

  it('listens in the language the page chose, each page on its own', async () => {
    const dg = await fakeDeepgram(() => undefined);
    servers.push(dg.wss);
    const first = await connectClient({
      deepgram: { apiKey: 'k', language: 'en', connect: dg.connect },
    });
    const second = await connectClient({
      deepgram: { apiKey: 'k', language: 'en', connect: dg.connect },
    });
    const languageOf = (url: string | undefined) => new URL(url ?? '').searchParams.get('language');

    first.ws.send(JSON.stringify({ type: 'session.settings', language: 'fr' }));
    await new Promise((r) => setTimeout(r, 100));
    first.ws.send(Buffer.alloc(3200));
    second.ws.send(Buffer.alloc(3200)); // never chose: English
    await expect.poll(() => dg.urls.length).toBe(2);
    expect(dg.urls.map(languageOf).sort()).toEqual(['en', 'fr']);

    first.ws.send(JSON.stringify({ type: 'session.settings', language: 'multi' }));
    await new Promise((r) => setTimeout(r, 100));
    first.ws.send(Buffer.alloc(3200));
    await expect.poll(() => dg.urls.length).toBe(3);
    expect(languageOf(dg.urls[2])).toBe('multi');
    first.ws.close();
    second.ws.close();
    await first.app.close();
    await second.app.close();
  });

  it('falls back to browser speech recognition when Deepgram fails', async () => {
    const { app, ws, events } = await connectClient({
      deepgram: {
        apiKey: 'k',
        language: 'en',
        now: () => (t += 5000),
        connect: () => new WebSocket('ws://127.0.0.1:1'),
      },
    });
    let t = 0;
    const audio = setInterval(() => ws.send(Buffer.alloc(3200)), 40);
    await expect
      .poll(() => events.filter((e) => e.type === 'session.ready').map((e) => e.stt))
      .toEqual(['deepgram', 'browser']);
    clearInterval(audio);
    ws.close();
    await app.close();
  });

  it('ignores audio and says "browser" when Deepgram is not configured', async () => {
    const { app, ws, events } = await connectClient({});
    ws.send(Buffer.alloc(3200));
    await expect.poll(() => events[0]).toMatchObject({ type: 'session.ready', stt: 'browser' });
    ws.close();
    await app.close();
  });
});
