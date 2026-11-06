import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { ClientEventSchema } from './events.js';

export async function buildApp() {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });
  await app.register(websocket);

  app.get('/health', async () => ({ ok: true }));

  app.get('/ws', { websocket: true }, (socket) => {
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
      app.log.debug({ type: parsed.data.type }, 'ws: event');
    });
  });

  return app;
}
