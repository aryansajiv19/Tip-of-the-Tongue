import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildApp } from './app.js';
import type { ServerEvent } from './events.js';

process.env.LOG_LEVEL = 'info';

type App = Awaited<ReturnType<typeof buildApp>>;
const apps: App[] = [];
afterEach(async () => {
  // fetch keeps connections open, which would make close() wait.
  await Promise.all(
    apps.splice(0).map((a) => {
      a.server.closeAllConnections();
      return a.close();
    }),
  );
});

async function start(deps: Parameters<typeof buildApp>[0] = {}) {
  const logs: string[] = [];
  const app = await buildApp({ logStream: { write: (l) => logs.push(l) }, ...deps });
  apps.push(app);
  await app.listen({ port: 0, host: '127.0.0.1' });
  return { app, logs, base: `127.0.0.1:${(app.server.address() as AddressInfo).port}` };
}

// Opens a socket and reports the first thing that happens: a message, or a close with its code.
function open(url: string) {
  return new Promise<{ event?: ServerEvent; closed?: number }>((resolve) => {
    const ws = new WebSocket(url);
    ws.on('message', (m) => {
      resolve({ event: JSON.parse(m.toString()) as ServerEvent });
      ws.close();
    });
    ws.on('close', (code) => resolve({ closed: code }));
    ws.on('error', () => resolve({}));
  });
}

describe('TOTT_TOKEN', () => {
  it('accepts a socket that carries the token', async () => {
    const { base } = await start({ token: 's3cret' });
    expect((await open(`ws://${base}/ws?token=s3cret`)).event?.type).toBe('session.ready');
  });

  it.each(['wrong', '', 's3cret-and-more'])('closes with 4401 for token "%s"', async (given) => {
    const { base } = await start({ token: 's3cret' });
    expect(await open(`ws://${base}/ws?token=${given}`)).toEqual({ closed: 4401 });
  });

  it('closes with 4401 when no token is sent', async () => {
    const { base } = await start({ token: 's3cret' });
    expect(await open(`ws://${base}/ws`)).toEqual({ closed: 4401 });
  });

  it('with no token configured, any socket is accepted as before', async () => {
    const { base } = await start({});
    expect((await open(`ws://${base}/ws`)).event?.type).toBe('session.ready');
    expect((await open(`ws://${base}/ws?token=whatever`)).event?.type).toBe('session.ready');
  });

  it('still checks the Origin first', async () => {
    const { base } = await start({ token: 's3cret', allowedOrigins: ['http://localhost:5173'] });
    const ws = new WebSocket(`ws://${base}/ws?token=s3cret`, { origin: 'http://evil.example' });
    const status = await new Promise((r) =>
      ws.on('unexpected-response', (_q, res) => r(res.statusCode)),
    );
    expect(status).toBe(403);
  });

  it('never writes the token to the log', async () => {
    const { base, logs } = await start({ token: 's3cret-token-value' });
    await open(`ws://${base}/ws?token=s3cret-token-value`);
    await open(`ws://${base}/ws?token=wrong-token-value`);
    expect(logs.join('')).not.toMatch(/token-value/);
  });
});

describe('WEB_DIST', () => {
  async function dist() {
    const dir = await mkdtemp(join(tmpdir(), 'tott-dist-'));
    await mkdir(join(dir, 'assets'));
    await writeFile(join(dir, 'index.html'), '<!doctype html><title>Tip</title>');
    await writeFile(join(dir, 'assets', 'app-abc123.js'), 'console.log(1)');
    await writeFile(join(dir, '..', 'tott-secret.txt'), 'outside').catch(() => undefined);
    return dir;
  }

  it('serves index.html at / and assets with their types', async () => {
    const { base } = await start({ webDist: await dist() });
    const page = await fetch(`http://${base}/`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toMatch(/text\/html/);
    expect(page.headers.get('cache-control')).toBe('no-cache');
    expect(await page.text()).toContain('<title>Tip</title>');
    const js = await fetch(`http://${base}/assets/app-abc123.js`);
    expect(js.headers.get('content-type')).toMatch(/javascript/);
    expect(js.headers.get('cache-control')).toMatch(/immutable/);
  });

  it('keeps /health and /ws working next to the page', async () => {
    const { base } = await start({ webDist: await dist() });
    expect(await (await fetch(`http://${base}/health`)).json()).toEqual({ ok: true });
    expect((await open(`ws://${base}/ws`)).event?.type).toBe('session.ready');
  });

  it('404s for a missing file and never leaves the folder', async () => {
    const { base } = await start({ webDist: await dist() });
    expect((await fetch(`http://${base}/nope.js`)).status).toBe(404);
    expect((await fetch(`http://${base}/..%2Ftott-secret.txt`)).status).toBe(404);
    expect((await fetch(`http://${base}/%2e%2e/%2e%2e/etc/passwd`)).status).toBe(404);
    expect((await fetch(`http://${base}/assets`)).status).toBe(404);
  });

  it('without WEB_DIST there is no page', async () => {
    const { base } = await start({});
    expect((await fetch(`http://${base}/`)).status).toBe(404);
    expect((await fetch(`http://${base}/health`)).status).toBe(200);
  });
});

describe('LOG_FILE', () => {
  it('appends the log to the file, with types but no words at info level', async () => {
    const file = join(await mkdtemp(join(tmpdir(), 'tott-log-')), 'tott.log');
    await writeFile(file, 'earlier line\n');
    const app = await buildApp({ logFile: file });
    apps.push(app);
    await app.listen({ port: 0, host: '127.0.0.1' });
    const port = (app.server.address() as AddressInfo).port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((r) => ws.once('message', r));
    ws.send(
      JSON.stringify({
        type: 'transcript.final',
        words: [{ text: 'pharmacy-secret', startMs: 0, endMs: 100 }],
      }),
    );
    await new Promise((r) => setTimeout(r, 300));
    ws.close();
    await app.close();
    const written = await readFile(file, 'utf8');
    expect(written.startsWith('earlier line\n')).toBe(true);
    expect(written).toContain('"type":"session.ready"');
    expect(written).not.toContain('pharmacy-secret');
  });
});
