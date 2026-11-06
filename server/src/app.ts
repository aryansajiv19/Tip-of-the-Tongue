import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { config } from './config.js';
import { ClientEventSchema, type ServerEvent } from './events.js';
import { createGuesser } from './guess/guesser.js';
import type { Profile } from './guess/profile.js';
import type { Guesser } from './guess/types.js';
import { createSession, type SessionOptions } from './session.js';

const MAX_MESSAGE_BYTES = 64 * 1024;

export interface AppDeps {
  guess?: Guesser;
  profile?: Profile;
  // Defaults to config.allowedOrigins.
  allowedOrigins?: string[];
  // Lets tests shorten the timings.
  session?: Partial<Omit<SessionOptions, 'guess' | 'profile'>>;
}

export async function buildApp(deps: AppDeps = {}) {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });
  await app.register(websocket, { options: { maxPayload: MAX_MESSAGE_BYTES } });

  const guess =
    deps.guess ??
    createGuesser({
      model: config.anthropicModel,
      timeoutMs: config.guessTimeoutMs,
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
    const session = createSession(send, {
      guess,
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
    socket.on('close', () => session.close());
    // Oversize or malformed frames surface here; log and let the socket close.
    socket.on('error', (err) => app.log.warn({ err }, 'ws: socket error'));

    socket.on('message', (raw) => {
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
