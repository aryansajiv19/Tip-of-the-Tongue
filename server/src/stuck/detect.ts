import type { Language, StuckReason, Word } from '../events.js';
import { disfluency, inStutterMode } from './disfluency.js';
import { cuesFor, fold, type Cues } from './languages.js';

export type StuckResult =
  | { stuck: false }
  // sinceMs: end of the stall marker, where the missing word's search starts. Words said
  // after it may already be the answer.
  | {
      stuck: true;
      reason: StuckReason;
      contextWindow: string;
      sinceMs: number;
      // A word they said and took back ("the fork, no, the..."): not to be offered.
      rejected?: string;
    };

// Only the end of the transcript matters, so an old cue cannot fire again and again.
const TAIL_WORDS = 15;
const TAIL_MS = 10_000;
const CONTEXT_WORDS = 60;

// A pause after one of these clearly ends a turn, so it is not a hesitation.
const SENTENCE_CLOSERS = new Set([
  'thanks',
  'okay',
  'ok',
  'right',
  'yeah',
  'bye',
  'goodbye',
  'cheers',
]);

// Lowercase, no punctuation, no apostrophes: Web Speech gives plain words, other STT adds punctuation.
function tokens(words: readonly Word[]): string[] {
  return words.flatMap((w) =>
    w.text
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean),
  );
}

// Browser speech recognition gives no punctuation, so any pause mid-utterance counts as a
// possible hesitation unless the last word clearly ends a sentence: it has . ? ! on it (the raw
// text, before the cue rules strip punctuation), or it is a closer like "thanks".
function endsSentence(last: Word): boolean {
  if (/[.?!]["')\]]*$/.test(last.text.trim())) return true;
  const spoken = tokens([last]);
  return SENTENCE_CLOSERS.has(spoken.at(-1) ?? '');
}

// endMs of the word each token came from.
function tokenEnds(words: readonly Word[]): number[] {
  return words.flatMap((w) => tokens([w]).map(() => w.endMs));
}

// Index of the token where `match` starts in the space-joined `text`.
const tokenAt = (text: string, charIndex: number): number =>
  text.slice(0, charIndex).split(' ').length - 1;

// A cue only counts near the end, so "the thing I like about this place is how quiet it is"
// (a cue early in a long fluent sentence) does not fire.
const CUE_NEAR_END_WORDS = 10;

// Index of the token that marks a filler, or undefined. `t` and `text` are accent-folded.
function fillerAt(
  t: string[],
  text: string,
  stutter: boolean,
  cues: readonly Cues[],
  determiners: ReadonlySet<string>,
): number | undefined {
  const n = t.length;
  const sound = t.findIndex((x, i) => i >= n - 3 && cues.some((c) => c.sounds.has(x)));
  if (sound >= 0) return sound;
  // "the the": a determiner said twice, with at most two words after it.
  // Not for someone who is stuttering: for them it is a repetition, not a search.
  for (let i = Math.max(1, n - 3); i < n && !stutter; i++) {
    const w = t[i] as string;
    if (w === t[i - 1] && determiners.has(w)) return i;
  }
  return firstCue(
    t,
    text,
    cues.flatMap((c) => c.filler),
  );
}

const describingAt = (t: string[], text: string, cues: readonly Cues[]) =>
  firstCue(
    t,
    text,
    cues.flatMap((c) => c.describing),
  );

function firstCue(t: string[], text: string, patterns: readonly RegExp[]): number | undefined {
  for (const re of patterns) {
    const at = re.exec(text)?.index;
    if (at === undefined) continue;
    const index = tokenAt(text, at);
    if (t.length - index <= CUE_NEAR_END_WORDS) return index;
  }
  return undefined;
}

// "the... the soft thing under my head" and then silence: the stall marker (a repeated
// determiner or a long gap between words) came before the description, and the speaker has
// now finished describing. Saying the word themselves ("yes", "sorry") cancels it.
// Returns the end time of the latest marker.
const RECOVERY = /\b(?:yes|sorry|oh|thats it|there it is|got it)\b/;

function stallMarkerEnd(
  recent: readonly Word[],
  pauseMs: number,
  determiners: ReadonlySet<string>,
): number | undefined {
  let markerEndMs: number | undefined;
  let afterMarker: string[] = [];
  let previous: Word | undefined;
  let lastToken: string | undefined;
  for (const word of recent) {
    const own = tokens([word]);
    const first = own[0];
    // A gap between two voices is someone else's turn, not a search for a word.
    const turnChange =
      previous?.speaker !== undefined &&
      word.speaker !== undefined &&
      previous.speaker !== word.speaker;
    if (previous !== undefined && !turnChange && word.startMs - previous.endMs > pauseMs) {
      markerEndMs = previous.endMs;
      afterMarker = [];
    } else if (first !== undefined && first === lastToken && determiners.has(first)) {
      markerEndMs = word.endMs;
      afterMarker = [];
    }
    afterMarker.push(...own);
    lastToken = own.at(-1) ?? lastToken;
    previous = word;
  }
  return RECOVERY.test(afterMarker.join(' ')) ? undefined : markerEndMs;
}

// "pass me the fork, no, the..." : the word before "no" / "I mean" / "sorry" was wrong. Only when
// they go on to a new noun phrase (or stop), so "no problem" and "I have no idea" are left alone.
const TAKEBACK = ['no', 'nope', 'sorry', 'wait', 'actually', 'rather'];
const TAKEBACK_TWO = [
  ['i', 'mean'],
  ['not', 'that'],
];
function rejectedWord(t: readonly string[], determiners: ReadonlySet<string>): string | undefined {
  const lastStart = t.length - 6;
  for (let i = Math.max(1, lastStart); i < t.length; i++) {
    const two = TAKEBACK_TWO.some(([a, b]) => t[i] === a && t[i + 1] === b);
    if (!two && !TAKEBACK.includes(t[i] as string)) continue;
    const after = t[i + (two ? 2 : 1)];
    const before = t[i - 1] as string;
    if (
      (after === undefined || determiners.has(after)) &&
      before.length >= 3 &&
      !determiners.has(before)
    )
      return before;
  }
  return undefined;
}

// What the microphone level says (from voice.activity events). Without it only words are used.
export interface VoiceInfo {
  voiced: boolean;
  // When the current state began.
  sinceMs: number;
  // The last finished stretch of sound, if any.
  lastVoiced?: { startMs: number; endMs: number };
}

// Sound with no words for this long is a hum ("mmm", "uhhh") that speech recognition dropped.
const HUM_MS = 800;
// Browser speech recognition stamps words when it first sees them, up to about this much
// after they were spoken, so a hum may start slightly "before" the last word ends.
const HUM_TOLERANCE_MS = 600;

export function detectStuck(
  words: readonly Word[],
  nowMs: number,
  // earlyMs: ask "would this be a stall after only earlyMs of silence?", for speculative
  // guessing. It replaces both silence requirements; the stall markers still use pauseMs.
  opts: { pauseMs: number; earlyMs?: number; voice?: VoiceInfo; language?: Language },
): StuckResult {
  if (words.length === 0) return { stuck: false };
  const ordered = [...words].sort((a, b) => a.startMs - b.startMs);
  const lastEndMs = Math.max(...ordered.map((w) => w.endMs));

  const contextWindow = ordered
    .slice(-CONTEXT_WORDS)
    .map((w) => w.text)
    .join(' ');
  const active = cuesFor(opts.language ?? 'en');
  const rejected = rejectedWord(tokens(ordered.slice(-TAIL_WORDS)), active.determiners);
  const hit = (reason: StuckReason, sinceMs: number): StuckResult => ({
    stuck: true,
    reason,
    contextWindow,
    sinceMs,
    ...(rejected !== undefined ? { rejected } : {}),
  });

  const silentMs = nowMs - lastEndMs;
  const last = ordered[ordered.length - 1] as Word;
  const voice = opts.voice;
  // Still making sound: words are on their way (speech recognition lags), so this is not a stall.
  // A hum is judged once it ends.
  if (voice?.voiced) return { stuck: false };
  const soundSilentMs = voice ? Math.max(0, nowMs - voice.sinceMs) : undefined;
  // How long it has really been quiet: no new words, and no sound either.
  const quietMs = soundSilentMs === undefined ? silentMs : Math.min(silentMs, soundSilentMs);

  // Stuttering: a pause after a repeated or begun word is a block, not a search. Only a cue
  // ("what's the word", a description) or a manual ask starts a guess then.
  const stutter = inStutterMode(disfluency(ordered, nowMs, active));
  // Past TAIL_MS nobody is searching for a word any more: the conversation has moved on.
  const paused =
    !stutter &&
    silentMs > (opts.earlyMs ?? opts.pauseMs) &&
    quietMs > (opts.earlyMs ?? opts.pauseMs) &&
    silentMs <= TAIL_MS &&
    tokens(ordered).length > 0 &&
    !endsSentence(last);

  // Cue phrases only count once the speaker has gone quiet: mid-flow they are just speech.
  if (!paused && quietMs < (opts.earlyMs ?? opts.pauseMs / 2)) return { stuck: false };

  const recent = ordered.slice(-TAIL_WORDS).filter((w) => w.endMs >= nowMs - TAIL_MS);
  const t = tokens(recent).slice(-TAIL_WORDS);
  const ends = tokenEnds(recent).slice(-TAIL_WORDS);

  const folded = t.map(fold);
  const foldedText = folded.join(' ');
  const { strong, weak, determiners } = active;
  const describing = describingAt(folded, foldedText, strong);
  const filler = fillerAt(folded, foldedText, stutter, strong, determiners);
  const marker = stutter ? undefined : stallMarkerEnd(recent, opts.pauseMs, determiners);
  // Cues in the other languages do not start a guess by themselves, but when the pause does they
  // say where the search began.
  const weakDescribing = describingAt(folded, foldedText, weak);
  const weakFiller = fillerAt(folded, foldedText, stutter, weak, determiners);
  const cueSince = [describing, filler, weakDescribing, weakFiller]
    .map((i) => (i === undefined ? undefined : ends[i]))
    .concat(marker)
    .filter((x): x is number => x !== undefined);

  // The search for the missing word starts at the earliest cue, or at the last word, which
  // counts as already said: "... the car" then silence must not offer "car".
  if (paused) return hit('pause', Math.min(last.startMs - 1, ...cueSince));
  if (describing !== undefined) return hit('describing', ends[describing] as number);
  if (filler !== undefined) return hit('filler', ends[filler] as number);
  if (marker !== undefined) return hit('describing', marker);

  // A hum after the last word, then quiet, with the sentence unfinished.
  const hum = voice?.lastVoiced;
  if (
    !stutter &&
    hum &&
    silentMs <= TAIL_MS &&
    !endsSentence(last) &&
    hum.endMs - hum.startMs >= HUM_MS &&
    hum.startMs >= lastEndMs - HUM_TOLERANCE_MS
  ) {
    return hit('hum', hum.startMs);
  }
  return { stuck: false };
}
