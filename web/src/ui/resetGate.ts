import type { ServerEvent } from '../../../server/src/events';

// After "new conversation" the server may still have events on the way that belong to the old
// one (an offer, a transcript word). Events arrive in order, so everything before the server's
// `session.cleared` is old: let nothing through until then.
export function createResetGate() {
  let waiting = false;
  return {
    // The user asked for a new conversation.
    reset() {
      waiting = true;
    },
    // A new connection is a new server session, so there is nothing old to wait for.
    connected() {
      waiting = false;
    },
    // True when the event belongs to the current conversation.
    pass(event: ServerEvent): boolean {
      if (event.type === 'session.cleared') {
        waiting = false;
        return false;
      }
      return !waiting;
    },
  };
}
