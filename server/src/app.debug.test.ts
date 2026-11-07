import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import type { ServerEvent, Word } from './events.js';
import { mockGuesser } from './guess/mock.js';

describe('over the socket', () => {
  const lines: string[] = [];

  async function connect() {
    lines.length = 0;
    const app = await buildApp({
      guess: mockGuesser,
      logStream: { write: (l) => lines.push(l) },
      session: { speculateAfterMs: 0 },
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const port = (app.server.address() as AddressInfo).port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const events: ServerEvent[] = [];
    ws.on('message', (d) => events.push(JSON.parse(d.toString()) as ServerEvent));
    await new Promise((r) => ws.once('open', r));
    return { app, ws, events };
  }
  const word = (text: string, at: number): Word => ({ text, startMs: at, endMs: at + 200 });

  it('sends no debug events unless asked, and logs no spoken words at info level either way', async () => {
    const { app, ws, events } = await connect();
    const now = Date.now();
    const said = ['zebrafish', 'quokka', 'the'].map((t, i) => word(t, now + i * 300));
    ws.send(JSON.stringify({ type: 'transcript.final', words: said }));
    ws.send(JSON.stringify({ type: 'session.brief', text: 'Brief about Quokkaland' }));
    await new Promise((r) => setTimeout(r, 300));
    expect(events.filter((e) => e.type === 'debug')).toEqual([]);

    ws.send(JSON.stringify({ type: 'session.debug', on: true }));
    ws.send(
      JSON.stringify({
        type: 'transcript.final',
        words: said.map((w) => ({ ...w, startMs: w.startMs + 5000, endMs: w.endMs + 5000 })),
      }),
    );
    await expect.poll(() => events.some((e) => e.type === 'debug')).toBe(true);
    ws.close();
    await app.close();

    const info = lines.map((l) => JSON.parse(l) as { level: number }).filter((l) => l.level >= 30);
    const text = JSON.stringify(info).toLowerCase();
    for (const secret of ['zebrafish', 'quokka']) expect(text).not.toContain(secret);
  });
});
