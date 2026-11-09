import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import type { FastifyInstance } from 'fastify';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

// Serves a built web folder (the Vite `dist`) so one process and one port run the whole app.
// A few lines instead of @fastify/static: the page is a handful of files, so no directory
// listings, range requests or precompressed variants are needed.
export function serveFolder(app: FastifyInstance, folder: string): void {
  const root = resolve(folder);
  app.get('/*', async (req, reply) => {
    const wanted = decodeURIComponent((req.params as { '*': string })['*']) || 'index.html';
    const file = resolve(join(root, wanted));
    // Never read outside the folder ("../.env").
    if (file !== root && !file.startsWith(root + sep)) return reply.code(404).send();
    const info = await stat(file).catch(() => undefined);
    if (!info?.isFile()) return reply.code(404).send();
    // Built asset names carry a hash, so they never change; the page itself must be re-read.
    return reply
      .header('content-type', TYPES[extname(file)] ?? 'application/octet-stream')
      .header(
        'cache-control',
        wanted.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      )
      .send(createReadStream(file));
  });
}
