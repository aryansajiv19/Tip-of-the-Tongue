import { useEffect, type Dispatch } from 'react';
import type { CardAction } from './cardState';

// While something is on the card, tells the reducer the time so its timeouts can fire.
export function useCardClock(active: boolean, dispatch: Dispatch<CardAction>) {
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => dispatch({ type: 'tick', nowMs: Date.now() }), 200);
    return () => clearInterval(t);
  }, [active, dispatch]);
}
