import type { DebugInfo, ServerEvent } from '../../../server/src/events';

export type DebugEvent = Extract<ServerEvent, { type: 'debug' }>;

const MAX_EVENTS = 20;
const MAX_WORDS = 60;

export interface DebugState {
  // Newest last. Transcript lines are kept apart (they arrive many times a second).
  events: DebugEvent[];
  heard: string[];
  partial: string;
  stt: Extract<DebugInfo, { kind: 'stt' }> | null;
  // Client clock, ms, when words last arrived; drives the silence timer.
  lastWordAt: number | null;
}

export const emptyDebug: DebugState = {
  events: [],
  heard: [],
  partial: '',
  stt: null,
  lastWordAt: null,
};

export function reduceDebug(state: DebugState, event: DebugEvent, nowMs: number): DebugState {
  const info = event.info;
  if (info.kind === 'transcript') {
    const words = info.text.split(/\s+/).filter(Boolean);
    return {
      ...state,
      heard: info.final ? [...state.heard, ...words].slice(-MAX_WORDS) : state.heard,
      partial: info.final ? '' : info.text,
      lastWordAt: words.length > 0 ? nowMs : state.lastWordAt,
    };
  }
  return {
    ...state,
    stt: info.kind === 'stt' ? info : state.stt,
    events: [...state.events, event].slice(-MAX_EVENTS),
  };
}
