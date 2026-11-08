import type { Word } from '../../server/src/events.js';
import type { Line, Scenario } from './scenarios.js';
import { toTimedWords } from './timeline.js';

// Silence between turns, and after a line where the user is stuck (long enough to see a pop-up).
const TURN_GAP_MS = 700;
const STALL_GAP_MS = 3000;

export interface PlacedLine {
  line: Line;
  words: Word[];
  startMs: number;
  endMs: number;
}

// What a speech recogniser sends: no punctuation and no "..." (the pause is just silence).
const spoken = (text: string): string => text.replace(/\.\.\./g, '').replace(/[.,?!;:]/g, '');

export const isStall = (l: Line): boolean => l.s === 'me' && Boolean(l.w) && !l.recover;

// Puts the lines of a conversation on one timeline. One microphone hears both speakers, so the
// session gets the words in this order with no speaker labels.
// `speakers` labels each word with its voice (the user is 0), as speaker separation would.
export function layoutScenario(sc: Scenario, speakers = false): PlacedLine[] {
  const placed: PlacedLine[] = [];
  let at = 500;
  for (const line of sc.lines) {
    const words = toTimedWords(line.t, {
      startMs: at,
      ...(sc.wordMs !== undefined ? { stepMs: sc.wordMs } : {}),
      ...(sc.stallMs !== undefined ? { pauseMs: sc.stallMs } : {}),
    });
    const endMs = words.at(-1)?.endMs ?? at;
    const heard = words.flatMap((w) => {
      const text = spoken(w.text);
      return text === ''
        ? []
        : [{ ...w, text, ...(speakers ? { speaker: line.s === 'me' ? 0 : 1 } : {}) }];
    });
    placed.push({ line, words: heard, startMs: at, endMs });
    at = endMs + (line.gap ?? (isStall(line) ? STALL_GAP_MS : TURN_GAP_MS));
  }
  return placed;
}

// Which line a moment belongs to: the line of the last word that had finished by then.
export function lineAt(placed: PlacedLine[], ms: number): number {
  let found = -1;
  placed.forEach((p, i) => {
    if (p.words.some((w) => w.endMs <= ms)) found = i;
  });
  return found;
}
