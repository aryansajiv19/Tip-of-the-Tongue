import { config } from '../../server/src/config.js';
import type { Candidate, ServerEvent, Word } from '../../server/src/events.js';
import type { Profile } from '../../server/src/guess/profile.js';
import type { GuessResult, Guesser } from '../../server/src/guess/types.js';
import { createSession } from '../../server/src/session.js';
import { lineAt, type PlacedLine } from './layout.js';
import type { Scenario } from './scenarios.js';

const STEP_MS = 100;
// Time after the last word before a final result arrives (endpointing).
const FINAL_AFTER_MS = 300;
const TAIL_MS = 5000;

export interface Offer {
  atMs: number;
  candidates: Candidate[];
  // The line whose last finished word came just before the pop-up.
  line: number;
  // Silence since that last word when the pop-up appeared.
  silenceMs: number;
}

// What the session did on each line, to explain a miss or a false pop-up.
export interface Trace {
  // The detector decided the user was stuck.
  stuck: { atMs: number; line: number; reason: string }[];
  guesses: {
    atMs: number;
    line: number;
    // The end of the text the guesser was asked about.
    phrase: string;
    // Empty when it abstained or failed.
    words: string[];
    abstain: boolean;
    error: boolean;
    latencyMs: number;
  }[];
}

export interface Replay {
  // Which voice the session took to be the user's, if it knew.
  speaker: number | undefined;
  offers: Offer[];
  trace: Trace;
  // Guess calls started, including early ones that were thrown away.
  guessCalls: number;
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

// Plays a conversation through the real session on a virtual clock. Words arrive as a speech
// recogniser would send them: partial results as words finish, a final shortly after each line.
// A guess takes its real time (Claude's latency) on the virtual clock too.
export async function replay(
  sc: Scenario,
  placed: PlacedLine[],
  guess: Guesser,
  profile?: Profile,
  // The user turned on continuations after the word.
  continuations = false,
): Promise<Replay> {
  let now = 0;
  const offers: Offer[] = [];
  const events: ServerEvent[] = [];
  let guessCalls = 0;
  const trace: Trace = { stuck: [], guesses: [] };

  const inFlight = new Set<Promise<void>>();
  let waiting: { releaseAt: number; fire: () => void }[] = [];
  const delayed: Guesser = (input, signal) =>
    new Promise<GuessResult>((resolve) => {
      guessCalls++;
      const startedAt = now;
      const call = guess(input, signal).then((result) => {
        trace.guesses.push({
          atMs: startedAt,
          line: lineAt(placed, startedAt),
          phrase: input.stuckPhrase.split(' ').slice(-10).join(' '),
          words: result.candidates.map((c) => `${c.word} ${c.confidence.toFixed(2)}`),
          abstain: result.abstain,
          error: result.error === true,
          latencyMs: result.latencyMs,
        });
        waiting.push({ releaseAt: startedAt + result.latencyMs, fire: () => resolve(result) });
      });
      inFlight.add(call);
      void call.finally(() => inFlight.delete(call));
    });

  const allWords = placed.flatMap((p) => p.words);
  const session = createSession(
    (event) => {
      events.push(event);
      if (event.type === 'stuck.detected') {
        trace.stuck.push({ atMs: now, line: lineAt(placed, now), reason: event.reason });
      }
      if (event.type !== 'guess.offered') return;
      const lastEnd = Math.max(0, ...allWords.filter((w) => w.endMs <= now).map((w) => w.endMs));
      offers.push({
        atMs: now,
        candidates: event.candidates,
        line: lineAt(placed, now),
        silenceMs: now - lastEnd,
      });
    },
    {
      guess: delayed,
      ...(profile ? { profile } : {}),
      pauseMs: sc.settings?.pauseMs ?? config.stuckPauseMs,
      minConfidence: config.gateMinConfidence,
      cooldownMs: config.cooldownMs,
      acceptWindowMs: config.acceptWindowMs,
      moveOnWords: config.moveOnWords,
      speculateAfterMs: config.speculateAfterMs,
      now: () => now,
    },
  );
  if (continuations) session.handle({ type: 'session.settings', continuations });
  if (sc.brief) session.handle({ type: 'session.brief', text: sc.brief });

  const finalised = new Set<number>();
  let speaker: number | undefined;
  const endMs = (placed.at(-1)?.endMs ?? 0) + TAIL_MS;
  try {
    for (now = 0; now <= endMs; now += STEP_MS) {
      let open: Word[] = [];
      placed.forEach((p, i) => {
        if (finalised.has(i) || now < p.startMs) return;
        const finished = p.words.filter((w) => w.endMs <= now);
        if (finished.length === p.words.length && now >= p.endMs + FINAL_AFTER_MS) {
          finalised.add(i);
          session.handle({ type: 'transcript.final', words: finished });
        } else {
          open = finished;
        }
      });
      // Also acts as the clock tick: the session looks for a stall each time it hears anything.
      session.handle({ type: 'transcript.partial', words: open });

      while (inFlight.size > 0) await Promise.all([...inFlight]);
      const ready = waiting.filter((d) => d.releaseAt <= now);
      waiting = waiting.filter((d) => d.releaseAt > now);
      for (const d of ready) d.fire();
      await tick();
      await tick();
    }
  } finally {
    speaker = session.speaker();
    session.close();
  }
  return { offers, guessCalls, trace, speaker };
}
