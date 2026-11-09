// Streams raw mic audio (16 kHz mono 16-bit PCM) to Deepgram and turns its results into the
// same transcript events the browser speech path sends, but with real word timings.
import WebSocket from 'ws';
import { z } from 'zod';
import type { Word } from '../events.js';

const AUDIO_SAMPLE_RATE = 16_000;

const DeepgramWordSchema = z.object({
  word: z.string(),
  punctuated_word: z.string().optional(),
  start: z.number(),
  end: z.number(),
  confidence: z.number().min(0).max(1).optional(),
  speaker: z.number().int().min(0).max(31).optional(),
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
      ...(w.speaker !== undefined ? { speaker: w.speaker } : {}),
    }));
  if (parsed.data.is_final && words.length === 0) return null;
  return { type: parsed.data.is_final ? 'transcript.final' : 'transcript.partial', words };
}

// `keyterm` is repeated once per term (Nova-3 only). Callers keep the list inside Deepgram's limits
// (see keyterms.ts); over the limit, Deepgram refuses the connection. A running stream takes a
// new list with a Configure message instead (see `updateKeyterms`).
export function deepgramUrl(
  language: string,
  keyterms: readonly string[] = [],
  diarize = false,
): string {
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
  // Adds a speaker number to each word.
  if (diarize) params.set('diarize', 'true');
  for (const term of keyterms) params.append('keyterm', term);
  return `wss://api.deepgram.com/v1/listen?${params}`;
}

export interface DeepgramOptions {
  apiKey: string;
  language: string;
  // Asked when a stream opens and after `updateKeyterms()`.
  keyterms?: () => readonly string[];
  // Ask Deepgram to label who said each word.
  diarize?: boolean;
  // A new stream has opened. Its speaker numbers start again, so earlier ones no longer apply.
  onStreamStart?: () => void;
  onEvent: (event: TranscriptEvent) => void;
  // Deepgram refused a keyterm update (the old terms stay). `code` is Deepgram's, never words.
  onConfigureFailure?: (code: string) => void;
  onError: (err: Error) => void;
  // After `onError`, Deepgram answers again (checked every `recoverAfterMs`): the stream works
  // from the next chunk of audio.
  onRecovered?: () => void;
  // A stream closed on its own, with Deepgram's close code and how long it had been open.
  onUnexpectedClose?: (code: number, openMs: number) => void;
  recoverAfterMs?: number;
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
// A dropped or refused connection is tried again after these waits (audio in between is lost);
// after the last one the caller falls back to browser speech recognition. A connection that
// opens starts the count again.
const RETRY_WAITS_MS = [1000, 2000, 4000];
// Once the caller has fallen back to browser speech, Deepgram is tried again this often.
const RECOVER_AFTER_MS = 60_000;
// A connection that closes on its own sooner than this after opening counts as a failure, so a
// server that accepts and hangs up cannot be reconnected to ten times a second.
const STABLE_AFTER_MS = 10_000;
// A connection that goes quiet without closing (Wi-Fi gone, laptop slept) never reports an
// error. Pings every few seconds tell: no reply of any kind for this long and it is dead.
const PING_EVERY_MS = 4000;
const DEAD_AFTER_MS = 12_000;

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
  // Once the retries run out we stop for good: the caller falls back to browser speech
  // recognition instead of retrying ten times a second.
  let failed = false;
  let failures = 0;
  let retryAtMs = 0;
  let recoverTimer: NodeJS.Timeout | undefined;

  // Checks whether Deepgram answers again, without audio: opens a connection and drops it.
  function scheduleProbe() {
    recoverTimer = setTimeout(() => {
      const socket = connect(
        deepgramUrl(opts.language, opts.keyterms?.() ?? [], opts.diarize),
        opts.apiKey,
      );
      let done = false;
      const again = () => {
        if (done) return;
        done = true;
        socket.terminate();
        scheduleProbe();
      };
      socket.on('error', again);
      socket.on('unexpected-response', again);
      socket.on('open', () => {
        done = true;
        socket.close();
        failed = false;
        failures = 0;
        retryAtMs = 0;
        opts.onRecovered?.();
      });
    }, opts.recoverAfterMs ?? RECOVER_AFTER_MS);
  }

  // `fatal`: retrying cannot help (a refused key).
  function fail(socket: WebSocket, err: Error, fatal = false) {
    // A stream we closed on purpose (idle, hang-up) may still report an error while it
    // shuts down, for example "closed before the connection was established". That is not a failure.
    if (ws !== socket) return;
    ws = undefined;
    pending = [];
    if (failed) return;
    const wait = RETRY_WAITS_MS[failures++];
    if (fatal || wait === undefined) {
      failed = true;
      opts.onError(err);
      // A refused key will not come right by itself; anything else might.
      if (!fatal) scheduleProbe();
    } else {
      retryAtMs = now() + wait;
    }
  }

  // Replaces the stream's keyterms in place: no reconnect, so no audio is lost and the speaker
  // numbers carry on.
  function configure(socket: WebSocket) {
    socket.send(JSON.stringify({ type: 'Configure', keyterms: opts.keyterms?.() ?? [] }));
  }

  // Drops the current stream; the next chunk of audio opens a new one.
  function drop() {
    clearTimeout(idleTimer);
    const old = ws;
    ws = undefined;
    pending = [];
    if (old?.readyState === WebSocket.OPEN) old.send(JSON.stringify({ type: 'CloseStream' }));
    else old?.terminate();
  }

  function open() {
    opts.onStreamStart?.();
    streamStartMs = now() - CHUNK_MS;
    const origin = streamStartMs;
    const urlTerms = opts.keyterms?.() ?? [];
    const socket = connect(deepgramUrl(opts.language, urlTerms, opts.diarize), opts.apiKey);
    ws = socket;
    let heardAtMs = now();
    let openedAtMs: number | undefined;
    let pingTimer: NodeJS.Timeout | undefined;
    socket.on('open', () => {
      openedAtMs = now();
      heardAtMs = openedAtMs;
      // The list changed while we were connecting.
      if (urlTerms.join('\n') !== (opts.keyterms?.() ?? []).join('\n')) configure(socket);
      for (const chunk of pending) socket.send(chunk);
      pending = [];
      pingTimer = setInterval(() => {
        if (now() - heardAtMs > DEAD_AFTER_MS) {
          fail(socket, new Error('deepgram stopped answering'));
          socket.terminate();
        } else if (socket.readyState === WebSocket.OPEN) {
          socket.ping();
        }
      }, PING_EVERY_MS);
    });
    socket.on('pong', () => {
      heardAtMs = now();
    });
    socket.on('message', (data) => {
      heardAtMs = now();
      let json: unknown;
      try {
        json = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (
        typeof json === 'object' &&
        json !== null &&
        'type' in json &&
        json.type === 'ConfigureFailure'
      ) {
        opts.onConfigureFailure?.(
          'code' in json && typeof json.code === 'string' ? json.code : '?',
        );
        return;
      }
      // Results from a stream we already closed still map with that stream's own origin.
      const event = toTranscriptEvent(json, origin);
      if (event) {
        // Words are coming: this connection works, so earlier failures no longer count.
        failures = 0;
        opts.onEvent(event);
      }
    });
    socket.on('error', (err) => fail(socket, err));
    socket.on('unexpected-response', (_req, res) => {
      const status = res.statusCode ?? 0;
      // 401, 403 and the like will not get better by asking again; 429 and 5xx might.
      const fatal = status >= 400 && status < 500 && status !== 429;
      fail(socket, new Error(`deepgram refused the connection: HTTP ${status}`), fatal);
      socket.terminate();
    });
    socket.on('close', (code) => {
      clearInterval(pingTimer);
      if (ws !== socket) return; // closed by us, or already counted as a failure
      const openMs = openedAtMs === undefined ? 0 : now() - openedAtMs;
      opts.onUnexpectedClose?.(code, openMs);
      if (openMs < STABLE_AFTER_MS) {
        fail(socket, new Error(`deepgram closed the connection after ${openMs} ms (code ${code})`));
      } else {
        // It was working: start again at once, with the count back at zero.
        ws = undefined;
        failures = 0;
      }
    });
  }

  return {
    send(chunk: Buffer) {
      if (failed) return;
      // Waiting to try again: this audio is lost.
      if (!ws && now() < retryAtMs) return;
      if (!ws) open();
      if (ws?.readyState === WebSocket.OPEN) ws.send(chunk);
      else if (pending.length < MAX_PENDING_CHUNKS) pending.push(chunk);
      clearTimeout(idleTimer);
      idleTimer = setTimeout(drop, IDLE_CLOSE_MS);
    },
    close() {
      clearTimeout(recoverTimer);
      drop();
    },
    // The words to teach Deepgram changed. A stream that is still connecting picks them up when
    // it opens; a stream that is not open yet uses them from the start.
    updateKeyterms() {
      if (ws?.readyState === WebSocket.OPEN) configure(ws);
    },
  };
}
