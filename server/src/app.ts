import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { config } from './config.js';
import { ClientEventSchema, type ServerEvent } from './events.js';
import { createGlossaryBuilder, type GlossaryBuilder } from './guess/glossary.js';
import { createGuesser } from './guess/guesser.js';
import type { Profile } from './guess/profile.js';
import type { Guesser } from './guess/types.js';
import { createSession, type SessionOptions } from './session.js';
import { createDeepgramStream, type DeepgramOptions } from './stt/deepgram.js';

// Room for a pasted brief of 50,000 characters, even if every one takes six bytes (a JSON-escaped control character).
// The glossary is built in the background, so it can take longer than a guess.
const GLOSSARY_TIMEOUT_MS = 20_000;
const MAX_MESSAGE_BYTES = 512 * 1024;

export interface AppDeps {
  // Receives the server log lines (one JSON object per line); tests use it to check what is logged.
  logStream?: { write(line: string): void };
  guess?: Guesser;
  profile?: Profile;
  buildGlossary?: GlossaryBuilder;
  // Defaults to config.allowedOrigins.
  allowedOrigins?: string[];
  // Server-side speech-to-text; defaults to Deepgram when DEEPGRAM_API_KEY is set.
  deepgram?: Pick<DeepgramOptions, 'apiKey' | 'language' | 'connect' | 'now'>;
  // Lets tests shorten the timings.
  session?: Partial<Omit<SessionOptions, 'guess' | 'profile'>>;
}

export async function buildApp(deps: AppDeps = {}) {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      ...(deps.logStream ? { stream: deps.logStream } : {}),
    },
  });
  await app.register(websocket, { options: { maxPayload: MAX_MESSAGE_BYTES } });

  const guess =
    deps.guess ??
    createGuesser({
      model: config.anthropicModel,
      timeoutMs: config.guessTimeoutMs,
      ...(config.anthropicApiKey ? { apiKey: config.anthropicApiKey } : {}),
    });

  const buildGlossary =
    deps.buildGlossary ??
    createGlossaryBuilder({
      model: config.anthropicModel,
      timeoutMs: GLOSSARY_TIMEOUT_MS,
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

  app.get('/ws', { websocket: true }, (socket) => {
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
          onError: (err) => {
            app.log.error({ err }, 'deepgram: failed, falling back to browser speech recognition');
            sttMode = 'browser';
            send({ type: 'session.ready', stt: 'browser' });
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
      onError: (err) => app.log.error({ err }, 'session: error'),
      ...(deps.profile ? { profile: deps.profile } : {}),
      ...deps.session,
    });
    send({ type: 'session.ready', stt: stt ? 'deepgram' : 'browser' });

    socket.on('close', () => {
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
