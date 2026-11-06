import type { Candidate, ServerEvent } from '../../../server/src/events';

export interface OfferState {
  id: string;
  candidates: Candidate[];
  acceptedWord?: string;
}

export type OfferAction = ServerEvent | { type: 'offer.clear' };

export const MAX_OFFERED = 3;

// One offer at a time. Events for a different offer id are ignored.
export function offerReducer(state: OfferState | null, action: OfferAction): OfferState | null {
  switch (action.type) {
    case 'guess.offered': {
      const candidates = [...action.candidates]
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, MAX_OFFERED);
      return candidates.length ? { id: action.id, candidates } : state;
    }
    case 'guess.withdrawn':
    case 'guess.expired':
      return state?.id === action.id ? null : state;
    case 'guess.accepted':
      return state?.id === action.id ? { ...state, acceptedWord: action.word } : state;
    case 'offer.clear':
      return null;
    default:
      return state;
  }
}
