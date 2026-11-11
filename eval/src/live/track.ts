import type { Word } from '../../../server/src/events.js';
import { isStall, type PlacedLine } from '../layout.js';
import type { Scenario } from '../scenarios.js';
import { durationMs, silence } from './audio.js';

// Silence before the first line, and after the last (so the final pause can be noticed).
const LEAD_IN_MS = 500;
export const TAIL_MS = 6000;
const TURN_GAP_MS = 700;
const STALL_GAP_MS = 3000;

export interface RenderedLine {
  line: Scenario['lines'][number];
  pcm: Buffer;
}

// Puts rendered lines one after another on one track with the same gaps as the text replay, and
// says where each line's speech starts and ends. Lines of the other person before the user's
// first line are dropped: the user presses Start when they begin.
export function buildTrack(lines: RenderedLine[]): { pcm: Buffer; placed: PlacedLine[] } {
  const firstOfUser = lines.findIndex((l) => l.line.s === 'me');
  const kept = lines.slice(Math.max(0, firstOfUser));
  const parts: Buffer[] = [silence(LEAD_IN_MS)];
  const placed: PlacedLine[] = [];
  let at = LEAD_IN_MS;
  for (const { line, pcm } of kept) {
    const endMs = at + durationMs(pcm);
    placed.push({ line, words: [], startMs: at, endMs });
    parts.push(pcm);
    const gap = line.gap ?? (isStall(line) ? STALL_GAP_MS : TURN_GAP_MS);
    parts.push(silence(gap));
    at = endMs + gap;
  }
  parts.push(silence(TAIL_MS));
  return { pcm: Buffer.concat(parts), placed };
}

// The line a pop-up belongs to: the last line that had started by then, so one that appears while
// the user is still talking counts for that line (as in the text replay), not for the line before.
export function lineForTime(placed: readonly PlacedLine[], ms: number): number {
  let found = -1;
  placed.forEach((p, i) => {
    if (p.startMs <= ms) found = i;
  });
  return found;
}

// How long it had been since the end of the last word spoken before `ms` (0 if none yet).
export function silenceBefore(wordEnds: readonly number[], ms: number): number {
  const last = Math.max(-1, ...wordEnds.filter((e) => e <= ms));
  return last < 0 ? 0 : ms - last;
}

// The line a spoken word belongs to: the last line that had started (within 150 ms) by then.
function lineOfWord(placed: readonly PlacedLine[], ms: number): number {
  let found = -1;
  placed.forEach((p, i) => {
    if (p.startMs - 150 <= ms) found = i;
  });
  return found;
}

export interface LabelStats {
  // The voice number the recogniser gave to most of the user's words, and to the other person's.
  userLabel: number | undefined;
  otherLabel: number | undefined;
  // Labelled words, and how many carried their speaker's usual label.
  words: number;
  right: number;
  // What was heard on each line, in order.
  heard: string[];
}

// A stretch where no audio was sent (listening paused). Track time stands still during it.
export interface Pause {
  // Time since the stream began, at which sending stopped, and for how long.
  atMs: number;
  lenMs: number;
}

// Track time (where we are in the audio) for a moment given as time since the stream began.
export function trackTime(sinceStartMs: number, pause?: Pause): number {
  if (!pause || sinceStartMs <= pause.atMs) return sinceStartMs;
  return Math.max(pause.atMs, sinceStartMs - pause.lenMs);
}

// Where to stop sending for a pause: in the gap before the user's first line from the fifth
// line on, so listening resumes with the user talking. Undefined if the track has no such gap.
export function pausePoint(placed: readonly PlacedLine[]): number | undefined {
  const next = placed.findIndex((p, i) => i >= 4 && p.line.s === 'me');
  const gapStart = placed[next - 1]?.endMs;
  const gapEnd = placed[next]?.startMs;
  return gapStart === undefined || gapEnd === undefined ? undefined : (gapStart + gapEnd) / 2;
}

// How well the recogniser told the voices apart, from the final words it returned. `trackMs`
// turns a word's server-clock start time into a time on the audio track.
export function labelStats(
  words: readonly Word[],
  placed: readonly PlacedLine[],
  trackMs: (serverMs: number) => number,
): LabelStats {
  const counts = { me: new Map<number, number>(), other: new Map<number, number>() };
  const heard: string[][] = placed.map(() => []);
  const labelled: { role: 'me' | 'other'; speaker: number }[] = [];
  for (const w of words) {
    const i = lineOfWord(placed, trackMs(w.startMs));
    const role = placed[i]?.line.s;
    if (!role) continue;
    heard[i]?.push(w.text);
    if (w.speaker === undefined) continue;
    counts[role].set(w.speaker, (counts[role].get(w.speaker) ?? 0) + 1);
    labelled.push({ role, speaker: w.speaker });
  }
  const top = (m: Map<number, number>) => [...m].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
  const userLabel = top(counts.me);
  const otherLabel = top(counts.other);
  const usual = { me: userLabel, other: otherLabel };
  return {
    userLabel,
    otherLabel,
    words: labelled.length,
    right: labelled.filter((l) => l.speaker === usual[l.role]).length,
    heard: heard.map((h) => h.join(' ')),
  };
}

// Each place where the speaker number changes between one labelled word and the next, in the
// order the words came. With one voice speaking, every change is the recogniser relabelling it.
export interface SpeakerChange {
  atMs: number;
  word: number;
  from: number;
  to: number;
}
export function speakerChanges(words: readonly { startMs: number; speaker?: number }[]): {
  labelled: number;
  counts: Record<number, number>;
  changes: SpeakerChange[];
} {
  const counts: Record<number, number> = {};
  const changes: SpeakerChange[] = [];
  let labelled = 0;
  let last: number | undefined;
  words.forEach((w, word) => {
    if (w.speaker === undefined) return;
    labelled++;
    counts[w.speaker] = (counts[w.speaker] ?? 0) + 1;
    if (last !== undefined && w.speaker !== last) {
      changes.push({ atMs: w.startMs, word, from: last, to: w.speaker });
    }
    last = w.speaker;
  });
  return { labelled, counts, changes };
}
