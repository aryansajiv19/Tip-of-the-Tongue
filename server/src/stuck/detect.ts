import type { StuckReason, Word } from '../events.js';

export type StuckResult =
  { stuck: false } | { stuck: true; reason: StuckReason; contextWindow: string };

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

function hasFiller(t: string[], text: string): boolean {
  const last3 = t.slice(-3);
  if (last3.some((x) => FILLER_SOUNDS.has(x))) return true;
  // "the the": a determiner said twice, with at most two words after it.
  const last4 = t.slice(-4);
  for (let i = 1; i < last4.length; i++) {
    const w = last4[i] as string;
    if (w === last4[i - 1] && DETERMINERS.has(w)) return true;
  }
  // "you know" as a stall ends the phrase; "do you know ..." or "you know what" do not.
  const n = t.length;
  if (n >= 2 && t[n - 2] === 'you' && t[n - 1] === 'know') {
    const before = t[n - 3];
    if (!before || !['do', 'did', 'if', 'as', 'dont', 'would', 'how'].includes(before)) return true;
  }
  return FILLER_PHRASES.some((re) => re.test(text));
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
  const hit = (reason: StuckReason): StuckResult => ({ stuck: true, reason, contextWindow });

  const allTokens = tokens(ordered);
  if (nowMs - lastEndMs > opts.pauseMs && endsIncomplete(allTokens)) return hit('pause');

  // Cue phrases only count once the speaker has gone quiet: mid-flow they are just speech.
  if (nowMs - lastEndMs < opts.pauseMs / 2) return { stuck: false };

  const recent = ordered.slice(-TAIL_WORDS).filter((w) => w.endMs >= nowMs - TAIL_MS);
  const t = tokens(recent).slice(-TAIL_WORDS);
  const text = t.join(' ');
  if (DESCRIBING_PATTERNS.some((re) => re.test(text))) return hit('describing');
  if (hasFiller(t, text)) return hit('filler');
  return { stuck: false };
}
