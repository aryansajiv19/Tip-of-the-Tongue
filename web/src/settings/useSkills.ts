import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { ClientEvent } from '../../../server/src/events';
import { PACKS } from '../skills/packs';
import type { SocketStatus } from '../socket/useSocket';
import { isEmpty, skills, skillsEvent } from './skills';

export const useSkillsState = () => useSyncExternalStore(skills.subscribe, skills.snapshot);

const TYPING_PAUSE_MS = 400;

// The server keeps the skills per connection: send them on every (re)connect and after each change.
// Nothing is sent until there is something to send, or something to clear.
export function useSendSkills(status: SocketStatus, send: (e: ClientEvent) => void) {
  const state = useSkillsState();
  const sent = useRef(false);
  useEffect(() => {
    if (status !== 'connected' || (isEmpty(state) && !sent.current)) return;
    const timer = setTimeout(() => {
      sent.current = !isEmpty(state);
      send(skillsEvent(state, PACKS));
    }, TYPING_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [status, state, send]);
}
