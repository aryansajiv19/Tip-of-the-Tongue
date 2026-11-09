import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { ClientEvent } from '../../../server/src/events';
import type { SocketStatus } from '../socket/useSocket';
import { aboutYou, isEmpty, profileEvent } from './aboutYou';

export const useAboutYouState = () => useSyncExternalStore(aboutYou.subscribe, aboutYou.snapshot);

const TYPING_PAUSE_MS = 400;

// The server keeps the profile per connection: send it on every (re)connect and after each change.
// Nothing is sent until there is something to send, or something to clear.
export function useSendAboutYou(status: SocketStatus, send: (e: ClientEvent) => void) {
  const state = useAboutYouState();
  const sent = useRef(false);
  useEffect(() => {
    if (status !== 'connected' || (isEmpty(state) && !sent.current)) return;
    const timer = setTimeout(() => {
      sent.current = !isEmpty(state);
      send(profileEvent(state));
    }, TYPING_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [status, state, send]);
}
