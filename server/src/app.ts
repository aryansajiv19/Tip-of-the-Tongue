import { appendFileSync } from 'node:fs';
import { createHash, timingSafeEqual } from 'node:crypto';
import Fastify, { type FastifyRequest } from 'fastify';
import websocket from '@fastify/websocket';
import { config } from './config.js';
import { ClientEventSchema, type ServerEvent } from './events.js';
import { createGlossaryBuilder, type GlossaryBuilder } from './guess/glossary.js';
import { createGuesser } from './guess/guesser.js';
import type { Profile } from './guess/profile.js';
import type { Guesser } from './guess/types.js';
import { serveFolder } from './static.js';
import { createSession, type SessionOptions } from './session.js';
import { createDeepgramStream, type DeepgramOptions } from './stt/deepgram.js';

// One JSON object per line. Sync on purpose: a few lines a second, and nothing is lost on a crash.
function traceTo(file: string) {
  appendFileSync(file, `${JSON.stringify({ kind: 'start', at: new Date().toISOString() })}\n`);
  return (record: Record<string, unknown>) => appendFileSync(file, `${JSON.stringify(record)}\n`);
}

// Room for a pasted brief of 50,000 characters, even if every one takes six bytes (a JSON-escaped control character).
// The glossary is built in the background, so it can take longer than a guess.
const GLOSSARY_TIMEOUT_MS = 20_000;
const HEARTBEAT_MS = 15_000;
const MAX_MESSAGE_BYTES = 512 * 1024;

export interface AppDeps {
  // Receives the server log lines (one JSON object per line); tests use it to check what is logged.
  logStream?: { write(line: string): void };
  guess?: Guesser;
  // Ping interval; tests shorten it.
  heartbeatMs?: number;
  profile?: Profile;
  buildGlossary?: GlossaryBuilder;
  // Defaults to config.logFile (LOG_FILE): append the log here instead of writing it to stdout.
  logFile?: string;
  // Defaults to config.token (TOTT_TOKEN): a WebSocket must open with ?token=<it>.
  token?: string;
  // Defaults to config.webDist (WEB_DIST): a built web folder to serve at /.
  webDist?: string;
  // Defaults to config.allowedOrigins.
  allowedOrigins?: string[];
  // Server-side speech-to-text; defaults to Deepgram when DEEPGRAM_API_KEY is set.
  deepgram?: Pick<DeepgramOptions, 'apiKey' | 'language' | 'connect' | 'now' | 'recoverAfterMs'>;
  // Lets tests shorten the timings.
  session?: Partial<Omit<SessionOptions, 'guess' | 'profile'>>;
}

export async function buildApp(deps: AppDeps = {}) {
  const logFile = deps.logFile ?? config.logFile;
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      ...(deps.logStream ? { stream: deps.logStream } : logFile ? { file: logFile } : {}),
      // The token travels in the query string, so it must not reach the log.
      serializers: {
        req: (req: FastifyRequest) => ({ method: req.method, url: req.url.replace(/\?.*/, '') }),
      },
    },
  });
  await app.register(websocket, { options: { maxPayload: MAX_MESSAGE_BYTES } });

  const guess =
    deps.guess ??
    createGuesser({
      model: config.anthropicModel,
      timeoutMs: config.guessTimeoutMs,
      onFailure: (info) => app.log.warn(info, 'guesser: Claude call failed'),
      ...(config.anthropicApiKey ? { apiKey: config.anthropicApiKey } : {}),
    });

  // Injected guessers (tests) count as real ones.
  const guesserKind = deps.guess || config.anthropicApiKey ? 'claude' : 'mock';

  const buildGlossary =
    deps.buildGlossary ??
    createGlossaryBuilder({
      model: config.anthropicModel,
      timeoutMs: GLOSSARY_TIMEOUT_MS,
      onFailure: (info) => app.log.warn(info, 'glossary: Claude call failed'),
      ...(config.anthropicApiKey ? { apiKey: config.anthropicApiKey } : {}),
    });

  // Browsers always send Origin on a WebSocket upgrade; other sites must not reach this socket.
  // Non-browser clients (tests, eval) send none and are allowed.
  const allowedOrigins = deps.allowedOrigins ?? config.allowedOrigins;
  app.addHook('onRequest', async (req, reply) => {
    const origin = req.headers.origin;
    if (
      req.routeOptions.url === '/ws' &&
      origin !== undefined &&
      !allowedOrigins.includes(origin)
    ) {
      app.log.warn({ origin }, 'ws: rejected origin');
      return reply.code(403).send({ error: 'origin not allowed' });
    }
  });

  app.get('/health', async () => ({ ok: true }));
  const webDist = deps.webDist ?? config.webDist;
  if (webDist) serveFolder(app, webDist);

  const token = deps.token ?? config.token;
  // Digests, so the comparison takes the same time whatever the length or the first wrong byte.
  const digest = (s: string) => createHash('sha256').update(s).digest();
  const tokenOk = (given: string | null) =>
    token === undefined || (given !== null && timingSafeEqual(digest(given), digest(token)));

  app.get('/ws', { websocket: true }, (socket, req) => {
    // A browser cannot read the status of a refused upgrade, so the socket opens and closes with 4401.
    if (!tokenOk(new URL(req.url, 'http://localhost').searchParams.get('token'))) {
      app.log.warn('ws: rejected token');
      socket.close(4401, 'token');
      return;
    }
    const send = (event: ServerEvent) => {
      // Type only at info level: payloads contain what the user said.
      app.log.info({ type: event.type }, 'ws: send');
      app.log.debug({ event }, 'ws: payload');
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
    };
    const deepgramOpts =
      deps.deepgram ??
      (config.deepgramApiKey ? { apiKey: config.deepgramApiKey, language: 'en' } : undefined);
    let sttMode: 'deepgram' | 'browser' = deepgramOpts ? 'deepgram' : 'browser';
    // The stream and the session refer to each other, but only after both exist.
    const stt = deepgramOpts
      ? createDeepgramStream({
          ...deepgramOpts,
          keyterms: () => session.keyterms(),
          diarize: config.deepgramDiarize,
          onStreamStart: () => session.forgetSpeaker(),
          onConfigureFailure: (code) =>
            app.log.warn({ code }, 'deepgram: keyterm update refused, old terms stay'),
          onEvent: (event) => {
            // Words still in flight from before a reset are neither shown nor used.
            const words = session.afterReset(event.words);
            if (words.length === 0 && event.type === 'transcript.final') return;
            const current = { ...event, words };
            send(current);
            session.handle(current);
          },
          onUnexpectedClose: (code, openMs) =>
            app.log.warn({ code, openMs }, 'deepgram: stream closed on its own'),
          onRecovered: () => {
            app.log.info('deepgram: answering again, back from browser speech recognition');
            sttMode = 'deepgram';
            send({ type: 'session.ready', stt: 'deepgram', guesser: guesserKind });
          },
          onError: (err) => {
            app.log.error({ err }, 'deepgram: failed, falling back to browser speech recognition');
            sttMode = 'browser';
            send({ type: 'session.ready', stt: 'browser', guesser: guesserKind });
          },
        })
      : undefined;
    const session = createSession(send, {
      sttMode: () => sttMode,
      onKeytermsChange: () => stt?.updateKeyterms(),
      onLanguageChange: (language) => stt?.setLanguage(language),
      guess,
      buildGlossary,
      pauseMs: config.stuckPauseMs,
      minConfidence: config.gateMinConfidence,
      cooldownMs: config.cooldownMs,
      acceptWindowMs: config.acceptWindowMs,
      moveOnWords: config.moveOnWords,
      speculateAfterMs: config.speculateAfterMs,
      log: (info) => app.log.info(info, 'session: timing'),
      ...(config.traceFile ? { trace: traceTo(config.traceFile) } : {}),
      onError: (err) => app.log.error({ err }, 'session: error'),
      ...(deps.profile ? { profile: deps.profile } : {}),
      ...deps.session,
    });
    send({ type: 'session.ready', stt: stt ? 'deepgram' : 'browser', guesser: guesserKind });

    // A protocol ping every beat: a socket that has not answered the last one is dead (a sleeping
    // laptop, a dropped network), so close it and end the session. The text event lets the page
    // tell the same, since a browser does not show it pings.
    let alive = true;
    socket.on('pong', () => (alive = true));
    const beat = setInterval(() => {
      if (!alive) {
        app.log.info('ws: no answer to ping, closing');
        socket.terminate();
        return;
      }
      alive = false;
      socket.ping();
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type: 'heartbeat' }));
    }, deps.heartbeatMs ?? HEARTBEAT_MS);

    socket.on('close', () => {
      clearInterval(beat);
      stt?.close();
      session.close();
    });
    // Oversize or malformed frames surface here; log and let the socket close.
    socket.on('error', (err) => app.log.warn({ err }, 'ws: socket error'));

    socket.on('message', (raw, isBinary) => {
      if (isBinary) {
        // Audio for server-side speech-to-text; ignored when it is off.
        if (!stt) return;
        if (Array.isArray(raw)) stt.send(Buffer.concat(raw));
        else stt.send(Buffer.isBuffer(raw) ? raw : Buffer.from(raw));
        return;
      }
      let json: unknown;
      try {
        json = JSON.parse(raw.toString());
      } catch {
        app.log.warn('ws: dropped non-JSON message');
        return;
      }
      const parsed = ClientEventSchema.safeParse(json);
      if (!parsed.success) {
        app.log.warn({ issues: parsed.error.issues }, 'ws: dropped invalid event');
        return;
      }
      try {
        session.handle(parsed.data);
      } catch (err) {
        app.log.error({ err }, 'session: handler failed');
      }
    });
  });

  return app;
}
