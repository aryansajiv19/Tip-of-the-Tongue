import type { Word } from '../../server/src/events.js';
import type { StuckResult } from '../../server/src/stuck/detect.js';

const WORD_STEP_MS = 300;
const WORD_LEN_MS = 100;
// A "..." in the written utterance stands for a real pause before the next word.
const PAUSE_MS = 2000;
// How often the live server checks for a stall.
const SWEEP_STEP_MS = 200;

export function toTimedWords(utterance: string): Word[] {
  const words: Word[] = [];
  let startMs = 0;
  for (const text of utterance.split(/\s+/).filter(Boolean)) {
    words.push({ text, startMs, endMs: startMs + WORD_LEN_MS });
    startMs = text.includes('...') ? startMs + WORD_LEN_MS + PAUSE_MS : startMs + WORD_STEP_MS;
  }
  return words;
}

export interface Trigger {
  nowMs: number;
  // The words the server had heard by then.
  heard: Word[];
  result: Extract<StuckResult, { stuck: true }>;
}

// Replays the live server: asks the detector every 200 ms, from the first word until 2 s after
// the last, using only the words that had finished by then. Returns every moment it fired.
export function sweep(
  words: Word[],
  detect: (heard: Word[], nowMs: number) => StuckResult,
): Trigger[] {
  const first = words[0];
  if (!first) return [];
  const lastEndMs = Math.max(...words.map((w) => w.endMs));
  const triggers: Trigger[] = [];
  for (let nowMs = first.endMs; nowMs <= lastEndMs + PAUSE_MS; nowMs += SWEEP_STEP_MS) {
    const heard = words.filter((w) => w.endMs <= nowMs);
    const result = detect(heard, nowMs);
    if (result.stuck) triggers.push({ nowMs, heard, result });
  }
  return triggers;
}
