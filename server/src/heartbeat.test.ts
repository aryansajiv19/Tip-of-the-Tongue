import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildApp } from './app.js';
import type { ServerEvent } from './events.js';

process.env.LOG_LEVEL = 'error';

async function connect(autoPong: boolean) {
  const app = await buildApp({ heartbeatMs: 40 });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const port = (app.server.address() as AddressInfo).port;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { autoPong });
  const events: ServerEvent[] = [];
  ws.on('message', (m) => events.push(JSON.parse(m.toString()) as ServerEvent));
  const closed = new Promise<void>((r) => ws.once('close', () => r()));
  await new Promise((r) => ws.once('open', r));
  return { app, ws, events, closed };
}

describe('websocket heartbeat', () => {
  it('keeps an answering client connected and sends it a heartbeat event', async () => {
    const { app, ws, events } = await connect(true);
    await expect.poll(() => events.filter((e) => e.type === 'heartbeat').length).toBeGreaterThan(2);
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
    await app.close();
  });

  it('closes a socket that stops answering pings', async () => {
    const { app, ws, closed } = await connect(false);
    await closed;
    expect(ws.readyState).toBe(WebSocket.CLOSED);
    await app.close();
  });
});
