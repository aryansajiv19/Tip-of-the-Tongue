import type { Word } from '../events.js';

// How long a pause must last before it counts as a stall depends on how the person talks: a slow
// speaker's ordinary gaps must not trigger, and a fast speaker's real stalls must not be missed.
// The setting (calm, balanced, eager) is the base; this scales it from the last ~200 words.

const WINDOW_WORDS = 200;
// Fewer intervals than this and the speaker is not known yet (about 10 s of normal speech, 20 s of slow speech).
const MIN_INTERVALS = 25;
// A longer gap is a turn, a stall or a break, not part of the speaking rate.
const MAX_INTERVAL_MS = 4000;
// Time from one word's start to the next's in the example conversations. Typical speech is
// between this and 1.5 times it, in which case the base is used as it is.
const REFERENCE_STEP_MS = 300;
const NEUTRAL_LOW = 0.8;
const NEUTRAL_HIGH = 1.5;
const MIN_FACTOR = 0.6;
const MAX_FACTOR = 2.5;
// A speaker who pauses often (breathing, slow articulation) has habitual gaps longer than the
// setting. Real stalls are rarer: if at least one gap in 12 words is as long as the pause, and
// there are at least 6 of them, those gaps are the way this person talks, and a stall must be 25%
// longer than their typical one. Ceiling: someone who really stalls that often is treated as
// breathy, and gets their offers later.
const MIN_HABITUAL_GAPS = 6;
const WORDS_PER_HABITUAL_GAP = 12;
const HABITUAL_MARGIN = 1.25;
const HABITUAL_FROM_MS = 1200;
// The settings' own minimum: below it the end of every sentence, before the other person starts,
// would start a guess.
const MIN_PAUSE_MS = 800;
const MAX_PAUSE_MS = 6000;

const percentile = (sorted: number[], p: number): number =>
  sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] as number;

// Words of other voices stay in the list, so that two of the user's words with someone else's
// between them are not taken for one long gap.
type IsOwn = (w: Word) => boolean;

function measure(words: readonly Word[], isOwn: IsOwn) {
  const w = [...words].sort((a, b) => a.startMs - b.startMs).slice(-WINDOW_WORDS);
  const steps: number[] = [];
  const gaps: number[] = [];
  for (let i = 1; i < w.length; i++) {
    const a = w[i - 1] as Word;
    const b = w[i] as Word;
    if (!isOwn(a) || !isOwn(b)) continue;
    const step = b.startMs - a.startMs;
    if (step > 0 && step <= MAX_INTERVAL_MS) steps.push(step);
    const gap = b.startMs - a.endMs;
    if (gap > 0 && gap <= MAX_INTERVAL_MS) gaps.push(gap);
  }
  steps.sort((x, y) => x - y);
  return { steps, gaps, count: w.length };
}

// The usual time from one word's start to the next's, once the speaker is known. The early guess
// waits at least this long, so that it does not start in every gap of a slow speaker.
export function typicalStepMs(
  words: readonly Word[],
  isOwn: IsOwn = () => true,
): number | undefined {
  const { steps } = measure(words, isOwn);
  return steps.length < MIN_INTERVALS ? undefined : percentile(steps, 0.5);
}

// The pause that counts as a stall for this speaker. `words` are the speaker's own, in any order.
export function effectivePauseMs(
  basePauseMs: number,
  words: readonly Word[],
  isOwn: IsOwn = () => true,
): number {
  const { steps, gaps, count } = measure(words, isOwn);
  if (steps.length < MIN_INTERVALS) return basePauseMs;
  const ratio = percentile(steps, 0.5) / REFERENCE_STEP_MS;
  const raw =
    ratio < NEUTRAL_LOW ? ratio / NEUTRAL_LOW : ratio > NEUTRAL_HIGH ? ratio / NEUTRAL_HIGH : 1;
  const factor = Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, raw));
  let pause = basePauseMs * factor;
  // Only for a person who is not fast, and only gaps of breath length: turn gaps and short stalls
  // are not their habit.
  const habitual = gaps.filter((g) => g >= Math.max(pause, HABITUAL_FROM_MS)).sort((x, y) => x - y);
  if (
    factor >= 1 &&
    habitual.length >= MIN_HABITUAL_GAPS &&
    habitual.length * WORDS_PER_HABITUAL_GAP >= count
  ) {
    pause = Math.max(pause, HABITUAL_MARGIN * percentile(habitual, 0.5));
  }
  return Math.round(Math.min(MAX_PAUSE_MS, Math.max(Math.min(MIN_PAUSE_MS, basePauseMs), pause)));
}
