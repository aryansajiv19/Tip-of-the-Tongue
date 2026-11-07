import { emptyDebug, reduceDebug, type DebugEvent, type DebugState } from './debugState';

// Where debug events from the socket land, so the panel can show them without going through App.
let state: DebugState = emptyDebug;
const listeners = new Set<() => void>();

export const debugBus = {
  push(event: DebugEvent, nowMs: number = Date.now()) {
    state = reduceDebug(state, event, nowMs);
    listeners.forEach((l) => l());
  },
  reset() {
    state = emptyDebug;
    listeners.forEach((l) => l());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  snapshot: (): DebugState => state,
};
