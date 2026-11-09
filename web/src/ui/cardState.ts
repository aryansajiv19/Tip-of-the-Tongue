import type { Candidate, ServerEvent } from '../../../server/src/events';

// What the suggestion card shows. Nothing (null) means the card is not on screen.
export type CardView =
  | { kind: 'thinking' }
  | { kind: 'offer'; id: string; primary: Candidate; alternatives: Candidate[] }
  | { kind: 'accepted'; word: string };

export interface CardState {
  view: CardView | null;
  // When the current view appeared, for the timeouts.
  sinceMs: number;
}

export const emptyCard: CardState = { view: null, sinceMs: 0 };

// A suggestion fades out on its own after this (keep equal to --card-linger in tokens.css).
export const LINGER_MS = 6000;
// The check mark stays this long before the card goes.
export const ACCEPTED_MS = 900;
// "Looking for the word" never outlasts this, even if the server says nothing more.
export const THINKING_MAX_MS = 8000;
// One main word and up to two alternatives.
const MAX_WORDS = 3;

export type CardAction =
  | { type: 'server'; event: ServerEvent; nowMs: number }
  // The user clicked a word (the server's accepted event follows, and is then ignored).
  | { type: 'picked'; word: string; nowMs: number }
  // Escape or the close button.
  | { type: 'dismiss' }
  // New conversation or a new connection.
  | { type: 'clear' }
  // Time passing, for the timeouts.
  | { type: 'tick'; nowMs: number }
  // The card is being read (hovered or focused): its timeouts wait for `byMs`.
  | { type: 'hold'; byMs: number };

const show = (view: CardView, nowMs: number): CardState => ({ view, sinceMs: nowMs });

export function cardReducer(state: CardState, action: CardAction): CardState {
  const { view } = state;
  switch (action.type) {
    case 'clear':
      return emptyCard;
    case 'dismiss':
      return view && view.kind !== 'accepted' ? emptyCard : state;
    case 'picked':
      return view?.kind === 'offer'
        ? show({ kind: 'accepted', word: action.word }, action.nowMs)
        : state;
    case 'hold':
      return view ? { ...state, sinceMs: state.sinceMs + action.byMs } : state;
    case 'tick': {
      if (!view) return state;
      const age = action.nowMs - state.sinceMs;
      const limit =
        view.kind === 'thinking'
          ? THINKING_MAX_MS
          : view.kind === 'offer'
            ? LINGER_MS
            : ACCEPTED_MS;
      return age >= limit ? emptyCard : state;
    }
    case 'server':
      return fromServer(state, action.event, action.nowMs);
  }
}

function fromServer(state: CardState, event: ServerEvent, nowMs: number): CardState {
  const { view } = state;
  switch (event.type) {
    case 'stuck.detected':
      // Already showing a suggestion: leave it alone.
      return view ? state : show({ kind: 'thinking' }, nowMs);
    case 'guess.idle':
      return view?.kind === 'thinking' ? emptyCard : state;
    case 'guess.offered': {
      const ranked = [...event.candidates]
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, MAX_WORDS);
      const [primary, ...alternatives] = ranked;
      return primary ? show({ kind: 'offer', id: event.id, primary, alternatives }, nowMs) : state;
    }
    case 'guess.withdrawn':
    case 'guess.expired':
      return view?.kind === 'offer' && view.id === event.id ? emptyCard : state;
    case 'guess.accepted':
      // The word the user said may be an alternative, so show that one.
      return view?.kind === 'offer' && view.id === event.id
        ? show({ kind: 'accepted', word: event.word }, nowMs)
        : state;
    default:
      return state;
  }
}
