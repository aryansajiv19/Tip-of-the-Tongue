import { randomUUID } from 'node:crypto';
import type { Candidate, ClientEvent, ServerEvent } from './events.js';
import { TranscriptBuffer } from './transcript/buffer.js';
import { detectStuck } from './stuck/detect.js';
import type { Guesser, Profile } from './guess/index.js';
import { decideOffer } from './gate/index.js';
import { checkAcceptance } from './accept/index.js';

export interface SessionOptions {
  guess: Guesser;
  profile?: Profile;
  pauseMs: number;
  minConfidence: number;
  cooldownMs: number;
  acceptWindowMs: number;
  // Words the user may say after an offer without picking one before we take it down.
  moveOnWords: number;
  now?: () => number;
  // Called when the guesser or a timer tick fails; the session carries on.
  onError?: (err: unknown) => void;
}

interface Offer {
  id: string;
  candidates: Candidate[];
  offeredAtMs: number;
}

// One per WebSocket connection: transcript in, stuck -> guess -> gate -> offer out.
// Word times come from the browser clock and `now` from the server clock; fine while both run
// on the same machine. ponytail: re-stamp words on arrival if the server is ever remote.
export function createSession(send: (event: ServerEvent) => void, opts: SessionOptions) {
  const now = opts.now ?? Date.now;
  const buffer = new TranscriptBuffer();
  const recentlyOffered = new Map<string, number>();
  let brief: string | undefined;
  let offer: Offer | undefined;
  let lastOfferAtMs: number | undefined;
  let guessing = false;
  // End time of the last word we already reacted to, so one stall triggers one guess.
  let handledUpToMs = -Infinity;
  let closed = false;

  function trackOffer(current: Offer) {
    const spoken = buffer.wordsSince(current.offeredAtMs);
    const result = checkAcceptance(current, spoken, now(), opts.acceptWindowMs);
    if (result.status === 'accepted') {
      send({ type: 'guess.accepted', id: current.id, word: result.word, afterMs: result.afterMs });
    } else if (result.status === 'expired') {
      send({ type: 'guess.expired', id: current.id });
    } else if (spoken.filter((w) => w.startMs > current.offeredAtMs).length >= opts.moveOnWords) {
      send({ type: 'guess.withdrawn', id: current.id, reason: 'self-recovered' });
    } else {
      return;
    }
    offer = undefined;
    handledUpToMs = buffer.words().at(-1)?.endMs ?? handledUpToMs;
  }

  async function guessFor(sinceMs: number, stuckPhrase: string) {
    guessing = true;
    try {
      await offerFor(stuckAtMs, stuckPhrase);
    } catch (err) {
      // The guesser promises never to throw; if it does, stay silent rather than crash.
      opts.onError?.(err);
    } finally {
      guessing = false;
    }
  }

  async function offerFor(stuckAtMs: number, stuckPhrase: string) {
    const result = await opts.guess({
      conversation: buffer.recentText(),
      stuckPhrase,
      ...(brief ? { brief } : {}),
      ...(opts.profile ? { profile: opts.profile } : {}),
    });
    if (closed) return;

    const decision = decideOffer(
      result,
      {
        // +1 so the word at the stall marker doesn't count as the user finding the answer.
        saidSinceStuck: buffer.wordsSince(sinceMs + 1),
        nowMs: now(),
        recentlyOffered,
        ...(lastOfferAtMs !== undefined ? { lastOfferAtMs } : {}),
      },
      { minConfidence: opts.minConfidence, cooldownMs: opts.cooldownMs },
    );
    if (!decision.offer) return;

    const offeredAtMs = now();
    offer = { id: randomUUID(), candidates: decision.candidates, offeredAtMs };
    lastOfferAtMs = offeredAtMs;
    for (const c of decision.candidates) recentlyOffered.set(c.word, offeredAtMs);
    send({
      type: 'guess.offered',
      id: offer.id,
      candidates: decision.candidates,
      latencyMs: result.latencyMs,
    });
  }

  function check() {
    if (closed) return;
    if (offer) return trackOffer(offer);
    if (guessing) return;

    const words = buffer.words();
    const last = words.at(-1);
    if (!last || last.endMs <= handledUpToMs) return;

    const stuck = detectStuck(words, now(), { pauseMs: opts.pauseMs });
    if (!stuck.stuck) return;

    handledUpToMs = last.endMs;
    send({ type: 'stuck.detected', reason: stuck.reason, contextWindow: stuck.contextWindow });
    void guessFor(stuck.sinceMs, stuck.contextWindow);
  }

  // Pauses are silence, so no event arrives when one passes; poll for them.
  const timer = setInterval(() => {
    try {
      check();
    } catch (err) {
      opts.onError?.(err);
    }
  }, 200);

  return {
    handle(event: ClientEvent) {
      if (event.type === 'session.brief') brief = event.text.trim() || undefined;
      else if (event.type === 'transcript.partial') buffer.applyPartial(event.words);
      else buffer.applyFinal(event.words);
      check();
    },
    close() {
      closed = true;
      clearInterval(timer);
    },
  };
}
