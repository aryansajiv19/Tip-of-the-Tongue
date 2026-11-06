import type { Word } from '../../../server/src/events';
import { stampWords, tokenize } from './stampWords';

// One entry of the browser's `event.results` list.
export interface RawResult {
  isFinal: boolean;
  transcript: string;
}

// Per recognition session. `words` is everything heard so far (final and interim) with
// stable times; the first `sentFinal` of them have already been sent as final.
export interface SpeechState {
  words: Word[];
  sentFinal: number;
  partialText: string;
}

export const emptySpeech: SpeechState = { words: [], sentFinal: 0, partialText: '' };

export interface Update {
  state: SpeechState;
  // Words that just became final (send as transcript.final), in order, each only once.
  final: Word[] | null;
  // The words still being recognised (send as transcript.partial); null if unchanged or none.
  partial: Word[] | null;
}

// Chrome splits one hypothesis into several results (by stability) and finalises short
// chunks, so a single result is not the utterance. Rebuild the whole text from ALL results
// on every event: the leading run of final results is final, the rest is interim.
// Already-seen words keep their times whatever chunking Chrome uses.
export function applyResults(state: SpeechState, results: RawResult[], nowMs: number): Update {
  let n = 0;
  while (n < results.length && results[n]?.isFinal) n++;
  const text = (rs: RawResult[]) => rs.map((r) => r.transcript).join(' ');

  const words = stampWords(state.words, text(results), nowMs);
  // Never go back: words already sent as final stay final even if Chrome rewrites them shorter.
  const boundary = Math.max(tokenize(text(results.slice(0, n))).length, state.sentFinal);
  const final = boundary > state.sentFinal ? words.slice(state.sentFinal, boundary) : null;
  const interim = words.slice(boundary);
  const partialText = interim.map((w) => w.text).join(' ');
  // A final empties the server's partial, so resend the interim after one.
  const partial = interim.length && (final || partialText !== state.partialText) ? interim : null;

  return { state: { words, sentFinal: boundary, partialText }, final, partial };
}

// Recognition is ending or restarting: whatever is still interim becomes final, so the
// server keeps it in context instead of losing it when the next partial replaces it.
export function flushSpeech(state: SpeechState): { state: SpeechState; final: Word[] | null } {
  const pending = state.words.slice(state.sentFinal);
  return { state: emptySpeech, final: pending.length ? pending : null };
}
