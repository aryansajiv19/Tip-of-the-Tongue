import { useCallback, useEffect, useReducer, useState } from 'react';
import {
  elapsedMs,
  idleClock,
  pauseClock,
  resetClock,
  startClock,
  type Clock,
} from './sessionState';

type Action = { type: 'listening'; on: boolean; now: number } | { type: 'reset'; now: number };

function reduce(c: Clock, a: Action): Clock {
  if (a.type === 'reset') return resetClock(c, a.now);
  return a.on ? startClock(c, a.now) : pauseClock(c, a.now);
}

// Elapsed listening time in ms, redrawn once a second, plus a way to start over.
export function useSessionClock(listening: boolean) {
  const [clock, dispatch] = useReducer(reduce, idleClock);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const at = Date.now();
    dispatch({ type: 'listening', on: listening, now: at });
    if (!listening) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [listening]);

  const reset = useCallback(() => dispatch({ type: 'reset', now: Date.now() }), []);

  // `now` ticks once a second; right after a start or reset it can still be a moment behind.
  return { elapsedMs: elapsedMs(clock, now), reset };
}
