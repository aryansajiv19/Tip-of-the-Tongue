import type { ServerEvent } from '../../../server/src/events';

const TYPES = new Set([
  'heartbeat',
  'session.ready',
  'transcript.partial',
  'transcript.final',
  'stuck.detected',
  'guess.offered',
  'guess.withdrawn',
  'guess.accepted',
  'guess.expired',
  'guess.idle',
  'session.cleared',
  'speaker.count',
  'guesser.status',
  'brief.terms',
  'debug',
]);

// Parse one WebSocket message. Anything that is not a known event returns null.
export function parseServerEvent(data: unknown): ServerEvent | null {
  if (typeof data !== 'string') return null;
  try {
    const v: unknown = JSON.parse(data);
    if (typeof v !== 'object' || v === null) return null;
    const type = (v as { type?: unknown }).type;
    return typeof type === 'string' && TYPES.has(type) ? (v as ServerEvent) : null;
  } catch {
    return null;
  }
}

// Reconnect delay: 1s, 2s, 4s ... capped at 15s.
export function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** Math.max(0, attempt), 15000);
}

// The server sends something at least every 15 s; after this long with nothing the connection is
// dead (a closed laptop, a dropped network) even if the browser has not noticed.
export const SILENT_MS = 40_000;
export const silentFor = (lastHeardMs: number, nowMs: number) => nowMs - lastHeardMs > SILENT_MS;

// The WebSocket address for a page. The packaged desktop app opens the page with ?token=..., and
// the server wants the same token on the socket; without one nothing is added.
export function socketUrl(loc: { protocol: string; host: string; search: string }): string {
  const scheme = loc.protocol === 'https:' ? 'wss' : 'ws';
  const token = new URLSearchParams(loc.search).get('token');
  const query = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${scheme}://${loc.host}/ws${query}`;
}
