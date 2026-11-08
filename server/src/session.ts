import { randomUUID } from 'node:crypto';
import type { Candidate, ClientEvent, ServerEvent } from './events.js';
import { TranscriptBuffer } from './transcript/buffer.js';
import { detectStuck, type VoiceInfo } from './stuck/detect.js';
import { endsWithAskForWord } from './stuck/manual.js';
import type { Profile } from './guess/profile.js';
import { briefForGuesser, LONG_BRIEF_CHARS, type GlossaryBuilder } from './guess/glossary.js';
import type { GuessResult, Guesser } from './guess/types.js';
import { decideOffer } from './gate/gate.js';
import { checkAcceptance } from './accept/accept.js';
import { normalizePhrase } from './gate/normalize.js';
import { selectKeyterms } from './stt/keyterms.js';
import type { DebugInfo } from './events.js';

export interface SessionOptions {
  guess: Guesser;
  profile?: Profile;
  // Summarises a long pasted brief into key terms; one background call per brief.
  buildGlossary?: GlossaryBuilder;
  // Called when the words worth teaching the speech recogniser change (brief or glossary).
  onKeytermsChange?: () => void;
  // How speech-to-text is running now; reported in the debug stream.
  sttMode?: () => 'deepgram' | 'browser';
  pauseMs: number;
  minConfidence: number;
  cooldownMs: number;
  acceptWindowMs: number;
  // Words the user may say after an offer without picking one before we take it down.
  moveOnWords: number;
  now?: () => number;
  // Silence after which a guess starts early, before the stall is confirmed. 0 or unset: off.
  speculateAfterMs?: number;
  // Timing and cost numbers (stall to offer, speculative calls wasted).
  log?: (info: Record<string, unknown>) => void;
  // Called when the guesser or a timer tick fails; the session carries on.
  onError?: (err: unknown) => void;
}

// A guess started on the early signal. It is only used if the stall is then confirmed with no
// new words in between.
interface Speculation {
  // End of the last word when it started; new words past this make it stale.
  lastEndMs: number;
  sinceMs: number;
  abort: AbortController;
  confirmed: boolean;
  // Asked for by the user (Space or "what's the word"): the offer cooldown does not apply.
  manual?: boolean;
  result?: GuessResult;
}

interface Offer {
  id: string;
  candidates: Candidate[];
  offeredAtMs: number;
}

// One per WebSocket connection: transcript in, stuck -> guess -> gate -> offer out.
// Word times come from the browser clock and `now` from the server clock; fine while both run
// on the same machine. ponytail: re-stamp words on arrival if the server is ever remote.
const VOICED_MAX_MS = 10_000;
// How much of the call the guesser reads: about eight minutes of speech, so a name from early in
// the call is still in view.
const CONVERSATION_WORDS = 1200;
// The stretch the guesser is told the user is stuck in.
const STUCK_WORDS = 60;

export function createSession(send: (event: ServerEvent) => void, opts: SessionOptions) {
  const now = opts.now ?? Date.now;
  const buffer = new TranscriptBuffer();
  const recentlyOffered = new Map<string, number>();
  let brief: string | undefined;
  let glossary: string | undefined;
  let keyterms: string[] = opts.profile ? selectKeyterms({ profile: opts.profile }) : [];
  let debugOn = false;
  let lastDetector = '';
  // Starts from the server default; the user can change it for this connection.
  let pauseMs = opts.pauseMs;
  let minConfidence = opts.minConfidence;
  let offer: Offer | undefined;
  let lastOfferAtMs: number | undefined;
  let spec: Speculation | undefined;
  // Cost: guesses started early, and how many were thrown away.
  let speculated = 0;
  let discarded = 0;
  // End time of the last word we already reacted to, so one stall triggers one guess.
  let handledUpToMs = -Infinity;
  let closed = false;
  // From voice.activity events; stays undefined for clients that don't send them.
  let voice: VoiceInfo | undefined;
  // The guesser counts as down after two failures in a row, and up again on the next success.
  let guessFailures = 0;
  let guesserDown = false;

  // Debug events carry what was said, so nothing is built or sent unless the client asked.
  function debug(info: () => DebugInfo) {
    if (debugOn) send({ type: 'debug', atMs: now(), info: info() });
  }

  function refreshKeyterms() {
    const next = selectKeyterms({
      ...(opts.profile ? { profile: opts.profile } : {}),
      ...(brief ? { brief } : {}),
      ...(glossary ? { glossary } : {}),
    });
    if (next.join('\n') === keyterms.join('\n')) return;
    keyterms = next;
    debug(sttInfo);
    opts.onKeytermsChange?.();
  }

  const sttInfo = (): DebugInfo => ({
    kind: 'stt',
    mode: opts.sttMode?.() ?? 'browser',
    keyterms,
  });

  function trackOffer(current: Offer) {
    const spoken = buffer.wordsSince(current.offeredAtMs);
    const result = checkAcceptance(current, spoken, now(), opts.acceptWindowMs);
    if (result.status === 'accepted') {
      send({ type: 'guess.accepted', id: current.id, word: result.word, afterMs: result.afterMs });
    } else if (result.status === 'expired') {
      send({ type: 'guess.expired', id: current.id });
    } else if (spoken.filter((w) => w.startMs > current.offeredAtMs).length >= opts.moveOnWords) {
      send({ type: 'guess.withdrawn', id: current.id, reason: 'self-recovered' });
      // They talked on without choosing: a better guess for the same stall may still be wanted.
      lastOfferAtMs = undefined;
    } else {
      return;
    }
    closeOffer();
  }

  function closeOffer() {
    offer = undefined;
    handledUpToMs = buffer.words().at(-1)?.endMs ?? handledUpToMs;
  }

  // The user clicked a word. Only the open offer, one of its own words, inside the accept
  // window counts; anything else (stale id, unknown word, late click) is ignored.
  function pick(id: string, word: string) {
    if (!offer || offer.id !== id || now() - offer.offeredAtMs > opts.acceptWindowMs) return;
    const key = normalizePhrase(word).join(' ');
    const chosen = offer.candidates.find((c) => normalizePhrase(c.word).join(' ') === key);
    if (!chosen) return;
    send({
      type: 'guess.accepted',
      id,
      word: chosen.word,
      afterMs: now() - offer.offeredAtMs,
    });
    closeOffer();
  }

  function noteGuess(failed: boolean) {
    guessFailures = failed ? guessFailures + 1 : 0;
    const down = guessFailures >= 2;
    if (down !== guesserDown) {
      guesserDown = down;
      send({ type: 'guesser.status', ok: !down });
    }
  }

  function discardSpeculation() {
    if (!spec) return;
    spec.abort.abort();
    spec = undefined;
    discarded++;
    opts.log?.({ speculated, discarded });
  }

  // Starts a guess and keeps it in `spec`. Whoever confirms the stall later offers it.
  function startGuess(lastEndMs: number, sinceMs: number, confirmed: boolean, manual = false) {
    const mine: Speculation = {
      lastEndMs,
      sinceMs,
      abort: new AbortController(),
      confirmed,
      manual,
    };
    spec = mine;
    if (!confirmed) speculated++;
    const failed: GuessResult = { candidates: [], abstain: true, latencyMs: 0, error: true };
    opts
      .guess(
        {
          conversation: buffer.markedText(CONVERSATION_WORDS, now()),
          stuckPhrase: buffer.markedText(STUCK_WORDS, now()),
          ...(brief ? { brief: briefForGuesser(brief, glossary) } : {}),
          ...(opts.profile ? { profile: opts.profile } : {}),
        },
        mine.abort.signal,
      )
      .catch((err: unknown) => {
        // The guesser promises never to throw; if it does, stay silent rather than crash.
        opts.onError?.(err);
        return failed;
      })
      .then((result) => {
        const stale = closed || spec !== mine;
        debug(() => ({
          kind: 'guess',
          speculative: !confirmed,
          stale,
          candidates: result.candidates,
          abstain: result.abstain,
          error: result.error === true,
          latencyMs: result.latencyMs,
        }));
        // Stale (new words arrived, or closed): nothing to do, not even count a failure.
        if (stale) return;
        mine.result = result;
        noteGuess(result.error === true);
        if (mine.confirmed) offerFrom(mine, result);
      })
      .catch((err: unknown) => opts.onError?.(err));
  }

  function offerFrom(current: Speculation, result: GuessResult) {
    spec = undefined;
    const decision = decideOffer(
      result,
      {
        // +1 so the word at the stall marker doesn't count as the user finding the answer.
        saidSinceStuck: buffer.wordsSince(current.sinceMs + 1),
        nowMs: now(),
        recentlyOffered,
        ...(lastOfferAtMs !== undefined && !current.manual ? { lastOfferAtMs } : {}),
      },
      { minConfidence, cooldownMs: opts.cooldownMs },
    );
    debug(() => ({
      kind: 'gate',
      offered: decision.offer,
      ...(decision.offer
        ? { words: decision.candidates.map((c) => c.word) }
        : { reason: decision.reason }),
    }));
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
    opts.log?.({
      stallToOfferMs: offeredAtMs - current.lastEndMs,
      guessMs: result.latencyMs,
      speculated,
      discarded,
    });
  }

  function check() {
    if (closed) return;
    if (offer) return trackOffer(offer);

    const words = buffer.words();
    const last = words.at(-1);
    if (!last) return;
    // New words since the early guess started: the speaker went on, so its result is stale.
    if (spec && spec.lastEndMs !== last.endMs) discardSpeculation();
    if (last.endMs <= handledUpToMs) return;
    if (endsWithAskForWord(words)) return askNow();

    const stuck = detectStuck(words, now(), { pauseMs, ...voiceOpt() });
    const decision = stuck.stuck ? `${stuck.reason}@${stuck.sinceMs}` : 'no';
    if (decision !== lastDetector) {
      lastDetector = decision;
      debug(() => ({
        kind: 'detector',
        stuck: stuck.stuck,
        silenceMs: now() - last.endMs,
        ...(stuck.stuck ? { reason: stuck.reason, sinceMs: stuck.sinceMs } : {}),
      }));
    }
    if (stuck.stuck) {
      handledUpToMs = last.endMs;
      send({ type: 'stuck.detected', reason: stuck.reason, contextWindow: stuck.contextWindow });
      if (!spec) return startGuess(last.endMs, stuck.sinceMs, true);
      spec.confirmed = true;
      // Already answered: offer at once. Otherwise offer the moment it lands.
      if (spec.result) offerFrom(spec, spec.result);
      return;
    }

    const earlyMs = opts.speculateAfterMs ?? 0;
    if (earlyMs > 0 && !spec) {
      const early = detectStuck(words, now(), { pauseMs, earlyMs, ...voiceOpt() });
      if (early.stuck) startGuess(last.endMs, early.sinceMs, false);
    }
  }

  // A voiced state that never ended (the page closed, a stuck microphone) is not trusted for long.
  function voiceOpt(): { voice?: VoiceInfo } {
    const stale = voice?.voiced && now() - voice.sinceMs > VOICED_MAX_MS;
    return voice && !stale ? { voice } : {};
  }

  function onVoice(voiced: boolean, atMs: number) {
    if (voice && (voiced === voice.voiced || atMs < voice.sinceMs)) return;
    const lastVoiced = voice?.voiced ? { startMs: voice.sinceMs, endMs: atMs } : voice?.lastVoiced;
    voice = { voiced, sinceMs: atMs, ...(lastVoiced ? { lastVoiced } : {}) };
  }

  // The user asked for a word now (Space, or "what's the word"): no pause wait, no cooldown.
  // Needs something said to work from, and does nothing while an offer is already showing.
  function askNow() {
    if (closed || offer) return;
    const last = buffer.words().at(-1);
    if (!last) return;
    handledUpToMs = last.endMs;
    const phrase = buffer.recentText();
    send({ type: 'stuck.detected', reason: 'manual', contextWindow: phrase });
    if (!spec) return startGuess(last.endMs, last.startMs - 1, true, true);
    spec.confirmed = true;
    spec.manual = true;
    if (spec.result) offerFrom(spec, spec.result);
  }

  // Pauses are silence, so no event arrives when one passes; poll for them.
  // A long brief is used from its start straight away; the glossary joins in when it is ready.
  function setBrief(next: string | undefined) {
    brief = next;
    glossary = undefined;
    refreshKeyterms();
    if (!next || next.length <= LONG_BRIEF_CHARS || !opts.buildGlossary) return;
    opts
      .buildGlossary(next)
      .then((terms) => {
        if (closed || brief !== next) return;
        glossary = terms;
        refreshKeyterms();
      })
      .catch((err: unknown) => opts.onError?.(err));
  }

  const timer = setInterval(() => {
    try {
      check();
    } catch (err) {
      opts.onError?.(err);
    }
  }, 100);

  return {
    handle(event: ClientEvent) {
      if (event.type === 'session.brief') setBrief(event.text.trim() || undefined);
      else if (event.type === 'session.settings') {
        pauseMs = event.pauseMs;
        if (event.minConfidence !== undefined) minConfidence = event.minConfidence;
      } else if (event.type === 'session.debug') {
        debugOn = event.on;
        debug(sttInfo);
      } else if (event.type === 'guess.picked') pick(event.id, event.word);
      else if (event.type === 'voice.activity') onVoice(event.voiced, event.atMs);
      else if (event.type === 'stuck.manual') askNow();
      else {
        debug(() => ({
          kind: 'transcript',
          final: event.type === 'transcript.final',
          text: event.words.map((w) => w.text).join(' '),
        }));
        if (event.type === 'transcript.partial') buffer.applyPartial(event.words);
        else buffer.applyFinal(event.words);
      }
      check();
    },
    // The words worth teaching the speech recogniser right now.
    keyterms: () => keyterms,
    close() {
      closed = true;
      spec?.abort.abort();
      clearInterval(timer);
    },
  };
}
