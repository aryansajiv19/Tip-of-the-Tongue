// The control pill's timer and mode, as plain functions so they can be tested without a page.

// Time spent listening. `startedAt` is set while the mic is live.
export interface Clock {
  elapsedMs: number;
  startedAt: number | null;
}

export const idleClock: Clock = { elapsedMs: 0, startedAt: null };

export function startClock(c: Clock, now: number): Clock {
  return c.startedAt === null ? { ...c, startedAt: now } : c;
}

export function pauseClock(c: Clock, now: number): Clock {
  return c.startedAt === null ? c : { elapsedMs: elapsedMs(c, now), startedAt: null };
}

// A new conversation starts from zero and keeps running if the mic is live.
export function resetClock(c: Clock, now: number): Clock {
  return { elapsedMs: 0, startedAt: c.startedAt === null ? null : now };
}

export function elapsedMs(c: Clock, now: number): number {
  return c.elapsedMs + (c.startedAt === null ? 0 : Math.max(0, now - c.startedAt));
}

// mm:ss; minutes keep counting past 59 ("75:03") so the pill never needs a third field.
export function formatClock(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export type Mode = 'Everyday' | 'Meeting';

// Meeting once the user has loaded a brief (or other context); Everyday otherwise.
export function sessionMode(brief: string | null): Mode {
  return brief !== null && brief.trim() !== '' ? 'Meeting' : 'Everyday';
}
