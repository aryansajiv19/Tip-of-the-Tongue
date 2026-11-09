import { useEffect, type Dispatch } from 'react';
import type { CardAction } from './cardState';

// While something is on the card, tells the reducer the time so its timeouts can fire. While the
// card is `held` (hovered or focused) the time is given back instead, so it stays as long as the
// user is reading it.
export function useCardClock(active: boolean, held: boolean, dispatch: Dispatch<CardAction>) {
  useEffect(() => {
    if (!active) return;
    let last = Date.now();
    const t = setInterval(() => {
      const now = Date.now();
      dispatch(held ? { type: 'hold', byMs: now - last } : { type: 'tick', nowMs: now });
      last = now;
    }, 200);
    return () => clearInterval(t);
  }, [active, held, dispatch]);
}
