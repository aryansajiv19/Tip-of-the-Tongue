import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { config } from './config.js';
import { ClientEventSchema, type ServerEvent } from './events.js';
import { createGuesser, type Guesser, type Profile } from './guess/index.js';
import { createSession, type SessionOptions } from './session.js';

export interface AppDeps {
  guess?: Guesser;
  profile?: Profile;
  // Lets tests shorten the timings.
  session?: Partial<Omit<SessionOptions, 'guess' | 'profile'>>;
}

export async function buildApp(deps: AppDeps = {}) {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });
  await app.register(websocket);

  const guess =
    deps.guess ??
    createGuesser({
      model: config.anthropicModel,
      timeoutMs: config.guessTimeoutMs,
      ...(config.anthropicApiKey ? { apiKey: config.anthropicApiKey } : {}),
    });

  app.get('/health', async () => ({ ok: true }));

  app.get('/ws', { websocket: true }, (socket) => {
    const send = (event: ServerEvent) => {
      // Type only at info level: payloads contain what the user said.
      app.log.info({ type: event.type }, 'ws: send');
      app.log.debug({ event }, 'ws: payload');
      socket.send(JSON.stringify(event));
    };
    const session = createSession(send, {
      guess,
      pauseMs: config.stuckPauseMs,
      minConfidence: config.gateMinConfidence,
      cooldownMs: config.cooldownMs,
      acceptWindowMs: config.acceptWindowMs,
      moveOnWords: config.moveOnWords,
      ...(deps.profile ? { profile: deps.profile } : {}),
      ...deps.session,
    });
    socket.on('close', () => session.close());

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
      session.handle(parsed.data);
    });
  });

  return app;
}
