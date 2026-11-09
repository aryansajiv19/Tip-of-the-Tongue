import type { Word } from '../../server/src/events.js';
import type { StuckResult } from '../../server/src/stuck/detect.js';

const WORD_STEP_MS = 300;
const WORD_LEN_MS = 100;
// A "..." in the written utterance stands for a real pause before the next word.
const PAUSE_MS = 2000;
// A "…" (one character) stands for a natural pause: a breath, or slow speech. Not a stall.
const BREATH_MS = 1500;
// How often the live server checks for a stall.
const SWEEP_STEP_MS = 200;

// `stepMs` is the time between word starts, `pauseMs` the silence for each "..." and `breathMs` for each "…". Fast talkers
// and short pauses are modelled by changing them.
export function toTimedWords(
  utterance: string,
  opts: { stepMs?: number; pauseMs?: number; breathMs?: number; startMs?: number } = {},
): Word[] {
  const step = opts.stepMs ?? WORD_STEP_MS;
  const pause = opts.pauseMs ?? PAUSE_MS;
  const breath = opts.breathMs ?? BREATH_MS;
  const len = Math.min(WORD_LEN_MS, step);
  const words: Word[] = [];
  let startMs = opts.startMs ?? 0;
  for (const text of utterance.split(/\s+/).filter(Boolean)) {
    words.push({ text, startMs, endMs: startMs + len });
    if (text.includes('...')) startMs += len + pause;
    else if (text.endsWith('…')) startMs += len + breath;
    else startMs += step;
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
