import type { StuckReason, Word } from '../events.js';

export type StuckResult =
  | { stuck: false }
  // sinceMs: end of the stall marker, where the missing word's search starts. Words said
  // after it may already be the answer.
  | { stuck: true; reason: StuckReason; contextWindow: string; sinceMs: number };

// Only the end of the transcript matters, so an old cue cannot fire again and again.
const TAIL_WORDS = 15;
const TAIL_MS = 10_000;
const CONTEXT_WORDS = 60;

// A phrase ending on one of these is unfinished: the speaker is missing the next word.
// Words that often end a complete clause ("that", "is", "so", "about") are left out on purpose.
const INCOMPLETE_ENDINGS = new Set(
  (
    'the a an my your his her our their some ' +
    'to of in on at for with from by into ' +
    'and but or because if when while ' +
    'will would can could should have has had be been not ' +
    'um uh er erm hmm ah'
  ).split(' '),
);

const FILLER_SOUNDS = new Set(['um', 'uh', 'er', 'erm', 'umm', 'uhh', 'hmm']);
const DETERMINERS = new Set(['the', 'a', 'an', 'my', 'your', 'his', 'her', 'our', 'their']);

// "the thing is, ..." and "the thing about ..." are ordinary speech, not a stall.
const NOT_A_STALL_AFTER_THING = 'is|was|are|were|about|here|there|has|had|will|would';

const FILLER_PHRASES = [
  /\bwhat(?:s| is| was)? (?:it|that) called\b/,
  /\bwhat (?:do )?you call (?:it|that|them)\b/,
  /\bwhat (?:its|it is) name\b/,
  /\bwhatchamacallit\b|\bwhatsit\b|\bthingamajig\b|\bthingy\b|\bthingummy\b/,
  new RegExp(`\\bthe thing(?! (?:${NOT_A_STALL_AFTER_THING})\\b)`),
];

const DESCRIBING_PATTERNS = [
  /\bthe (?:thing|stuff) (?:you|i|for|to|where|which|with)\b/,
  /\bthe (?:place|man|person|woman|guy|lady|one|people) (?:who|where|that|which|you)\b/,
  /\bthe (?:\w+ )?one (?:you|that|who|where|with)\b/,
  /\bthe \w+ (?:we|you|i) use for\b/,
  /\bthe \w+ where (?:all|you|they|people)\b/,
  /\b\w+ thing (?:you|i|that)\b/,
  /\bits like (?:a|an|the)\b/,
];

// Lowercase, no punctuation, no apostrophes: Web Speech gives plain words, other STT adds punctuation.
function tokens(words: readonly Word[]): string[] {
  return words.flatMap((w) =>
    w.text
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean),
  );
}

function endsIncomplete(t: string[]): boolean {
  return t.length > 0 && INCOMPLETE_ENDINGS.has(t[t.length - 1] as string);
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

// Index of the token that marks a filler, or undefined.
function fillerAt(t: string[], text: string): number | undefined {
  const n = t.length;
  const sound = t.findIndex((x, i) => i >= n - 3 && FILLER_SOUNDS.has(x));
  if (sound >= 0) return sound;
  // "the the": a determiner said twice, with at most two words after it.
  for (let i = Math.max(1, n - 3); i < n; i++) {
    const w = t[i] as string;
    if (w === t[i - 1] && DETERMINERS.has(w)) return i;
  }
  // "you know" as a stall ends the phrase; "do you know ..." or "you know what" do not.
  if (n >= 2 && t[n - 2] === 'you' && t[n - 1] === 'know') {
    const before = t[n - 3];
    if (!before || !['do', 'did', 'if', 'as', 'dont', 'would', 'how'].includes(before))
      return n - 2;
  }
  for (const re of FILLER_PHRASES) {
    const at = re.exec(text)?.index;
    if (at !== undefined && t.length - tokenAt(text, at) <= CUE_NEAR_END_WORDS) {
      return tokenAt(text, at);
    }
  }
  return undefined;
}

function describingAt(t: string[], text: string): number | undefined {
  for (const re of DESCRIBING_PATTERNS) {
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

function stallMarkerEnd(recent: readonly Word[], pauseMs: number): number | undefined {
  let markerEndMs: number | undefined;
  let afterMarker: string[] = [];
  let previous: Word | undefined;
  let lastToken: string | undefined;
  for (const word of recent) {
    const own = tokens([word]);
    const first = own[0];
    if (previous !== undefined && word.startMs - previous.endMs > pauseMs) {
      markerEndMs = previous.endMs;
      afterMarker = [];
    } else if (first !== undefined && first === lastToken && DETERMINERS.has(first)) {
      markerEndMs = word.endMs;
      afterMarker = [];
    }
    afterMarker.push(...own);
    lastToken = own.at(-1) ?? lastToken;
    previous = word;
  }
  return RECOVERY.test(afterMarker.join(' ')) ? undefined : markerEndMs;
}

export function detectStuck(
  words: readonly Word[],
  nowMs: number,
  opts: { pauseMs: number },
): StuckResult {
  if (words.length === 0) return { stuck: false };
  const ordered = [...words].sort((a, b) => a.startMs - b.startMs);
  const lastEndMs = Math.max(...ordered.map((w) => w.endMs));

  const contextWindow = ordered
    .slice(-CONTEXT_WORDS)
    .map((w) => w.text)
    .join(' ');
  const hit = (reason: StuckReason, sinceMs: number): StuckResult => ({
    stuck: true,
    reason,
    contextWindow,
    sinceMs,
  });

  if (nowMs - lastEndMs > opts.pauseMs && endsIncomplete(tokens(ordered))) {
    return hit('pause', lastEndMs);
  }

  // Cue phrases only count once the speaker has gone quiet: mid-flow they are just speech.
  if (nowMs - lastEndMs < opts.pauseMs / 2) return { stuck: false };

  const recent = ordered.slice(-TAIL_WORDS).filter((w) => w.endMs >= nowMs - TAIL_MS);
  const t = tokens(recent).slice(-TAIL_WORDS);
  const ends = tokenEnds(recent).slice(-TAIL_WORDS);
  const text = t.join(' ');

  const describing = describingAt(t, text);
  if (describing !== undefined) return hit('describing', ends[describing] as number);
  const filler = fillerAt(t, text);
  if (filler !== undefined) return hit('filler', ends[filler] as number);
  const marker = stallMarkerEnd(recent, opts.pauseMs);
  if (marker !== undefined) return hit('describing', marker);
  return { stuck: false };
}
