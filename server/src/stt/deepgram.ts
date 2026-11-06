// Streams raw mic audio (16 kHz mono 16-bit PCM) to Deepgram and turns its results into the
// same transcript events the browser speech path sends, but with real word timings.
import WebSocket from 'ws';
import { z } from 'zod';
import type { Word } from '../events.js';

export const AUDIO_SAMPLE_RATE = 16_000;

const DeepgramWordSchema = z.object({
  word: z.string(),
  punctuated_word: z.string().optional(),
  start: z.number(),
  end: z.number(),
  confidence: z.number().min(0).max(1).optional(),
});

const ResultsSchema = z.object({
  type: z.literal('Results'),
  is_final: z.boolean(),
  channel: z.object({
    alternatives: z.array(z.object({ words: z.array(DeepgramWordSchema) })),
  }),
});

export type TranscriptEvent = { type: 'transcript.partial' | 'transcript.final'; words: Word[] };

// Deepgram times are seconds from the start of the audio stream; `streamStartMs` maps them to
// epoch ms.
export function toTranscriptEvent(message: unknown, streamStartMs: number): TranscriptEvent | null {
  const parsed = ResultsSchema.safeParse(message);
  if (!parsed.success) return null;
  const words: Word[] = (parsed.data.channel.alternatives[0]?.words ?? [])
    .filter((w) => w.word.trim() !== '')
    .map((w) => ({
      text: (w.punctuated_word ?? w.word).slice(0, 100),
      startMs: streamStartMs + w.start * 1000,
      endMs: streamStartMs + w.end * 1000,
      ...(w.confidence !== undefined ? { confidence: w.confidence } : {}),
    }));
  if (parsed.data.is_final && words.length === 0) return null;
  return { type: parsed.data.is_final ? 'transcript.final' : 'transcript.partial', words };
}

// `keyterm` is repeated once per term (Nova-3 only). Callers keep the list inside Deepgram's limits
// (see keyterms.ts); over the limit, Deepgram refuses the connection.
export function deepgramUrl(language: string, keyterms: readonly string[] = []): string {
  const params = new URLSearchParams({
    model: 'nova-3',
    language,
    encoding: 'linear16',
    sample_rate: String(AUDIO_SAMPLE_RATE),
    channels: '1',
    interim_results: 'true',
    // Keep "um"/"uh": they are stall cues for the detector.
    filler_words: 'true',
    // Off on purpose: Deepgram puts a full stop at long pauses ("the place."), which would make
    // a real stall look like a finished sentence. The guesser judges completeness instead.
    punctuate: 'false',
    endpointing: '300',
  });
  for (const term of keyterms) params.append('keyterm', term);
  return `wss://api.deepgram.com/v1/listen?${params}`;
}

export interface DeepgramOptions {
  apiKey: string;
  language: string;
  // Asked for each time a stream opens, so a change shows up after `restart()`.
  keyterms?: () => readonly string[];
  onEvent: (event: TranscriptEvent) => void;
  onError: (err: Error) => void;
  // Injectable for tests.
  connect?: (url: string, apiKey: string) => WebSocket;
  now?: () => number;
}

// After this long without audio (the user paused listening), close the stream. The next chunk
// opens a new one with a fresh time origin, so pauses in sending never skew word times.
const IDLE_CLOSE_MS = 3000;
// Audio arrives in ~100 ms chunks, so the first chunk started about this long before it arrived.
// ponytail: origin is estimated from arrival time, off by network jitter (~tens of ms).
const CHUNK_MS = 100;
// Audio kept while the connection opens: about 5 s.
const MAX_PENDING_CHUNKS = 50;

export function createDeepgramStream(opts: DeepgramOptions) {
  const now = opts.now ?? Date.now;
  const connect =
    opts.connect ??
    ((url: string, apiKey: string) =>
      new WebSocket(url, { headers: { Authorization: `Token ${apiKey}` } }));
  let ws: WebSocket | undefined;
  let streamStartMs = 0;
  let pending: Buffer[] = [];
  let idleTimer: NodeJS.Timeout | undefined;
  // After a connection failure we stop: the caller falls back to browser speech recognition
  // instead of retrying ten times a second.
  let failed = false;

  function fail(socket: WebSocket, err: Error) {
    if (ws === socket) ws = undefined;
    if (failed) return;
    failed = true;
    pending = [];
    opts.onError(err);
  }

  function close() {
    clearTimeout(idleTimer);
    const old = ws;
    ws = undefined;
    pending = [];
    if (old?.readyState === WebSocket.OPEN) old.send(JSON.stringify({ type: 'CloseStream' }));
    else old?.terminate();
  }

  function open() {
    streamStartMs = now() - CHUNK_MS;
    const origin = streamStartMs;
    const socket = connect(deepgramUrl(opts.language, opts.keyterms?.() ?? []), opts.apiKey);
    ws = socket;
    socket.on('open', () => {
      for (const chunk of pending) socket.send(chunk);
      pending = [];
    });
    socket.on('message', (data) => {
      let json: unknown;
      try {
        json = JSON.parse(data.toString());
      } catch {
        return;
      }
      // Results from a stream we already closed still map with that stream's own origin.
      const event = toTranscriptEvent(json, origin);
      if (event) opts.onEvent(event);
    });
    socket.on('error', (err) => fail(socket, err));
    socket.on('unexpected-response', (_req, res) => {
      fail(socket, new Error(`deepgram refused the connection: HTTP ${res.statusCode}`));
      socket.terminate();
    });
    socket.on('close', () => {
      if (ws === socket) ws = undefined;
    });
  }

  return {
    send(chunk: Buffer) {
      if (failed) return;
      if (!ws) open();
      if (ws?.readyState === WebSocket.OPEN) ws.send(chunk);
      else if (pending.length < MAX_PENDING_CHUNKS) pending.push(chunk);
      clearTimeout(idleTimer);
      idleTimer = setTimeout(close, IDLE_CLOSE_MS);
    },
    close,
    // Keyterms can only be set when a stream opens. Drop the current one; the next chunk of audio
    // opens a new stream with the current keyterms.
    restart() {
      if (ws) close();
    },
  };
}
