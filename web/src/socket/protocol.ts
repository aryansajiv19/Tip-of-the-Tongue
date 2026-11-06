import type { ServerEvent } from '../../../server/src/events';

const TYPES = new Set([
  'session.ready',
  'transcript.partial',
  'transcript.final',
  'stuck.detected',
  'guess.offered',
  'guess.withdrawn',
  'guess.accepted',
  'guess.expired',
  'guesser.status',
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
