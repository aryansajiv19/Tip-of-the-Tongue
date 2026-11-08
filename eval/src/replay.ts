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

export interface Replay {
  offers: Offer[];
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
): Promise<Replay> {
  let now = 0;
  const offers: Offer[] = [];
  const events: ServerEvent[] = [];
  let guessCalls = 0;

  const inFlight = new Set<Promise<void>>();
  let waiting: { releaseAt: number; fire: () => void }[] = [];
  const delayed: Guesser = (input, signal) =>
    new Promise<GuessResult>((resolve) => {
      guessCalls++;
      const startedAt = now;
      const call = guess(input, signal).then((result) => {
        waiting.push({ releaseAt: startedAt + result.latencyMs, fire: () => resolve(result) });
      });
      inFlight.add(call);
      void call.finally(() => inFlight.delete(call));
    });

  const allWords = placed.flatMap((p) => p.words);
  const session = createSession(
    (event) => {
      events.push(event);
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
  if (sc.brief) session.handle({ type: 'session.brief', text: sc.brief });

  const finalised = new Set<number>();
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
    session.close();
  }
  return { offers, guessCalls };
}
