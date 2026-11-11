import type { Word } from '../events.js';

// The user is the loudest voice at their own microphone: people across the room, or a call coming
// out of a speaker, are quieter. The page sends the microphone level (RMS, 0 to 1) every 50 ms;
// this keeps the recent readings and works out how loud each speaker was over their words.
export const READING_MS = 50;
// Readings below this (-60 dB) are silence, not a quiet voice.
const FLOOR = 0.001;
const KEEP_MS = 120_000;
// A word's time counts the audio from when its first chunk arrived, and the page reads the level
// as sound is made, a chunk (100 ms) earlier than the chunk arrives.
const AUDIO_DELAY_MS = 100;

export class LevelLog {
  private readings: { atMs: number; db: number }[] = [];

  // `levels` are consecutive readings, the first taken at `atMs`.
  add(atMs: number, levels: readonly number[]): void {
    levels.forEach((rms, i) => {
      if (rms >= FLOOR)
        this.readings.push({ atMs: atMs + i * READING_MS, db: 20 * Math.log10(rms) });
    });
    const oldest = (this.readings.at(-1)?.atMs ?? atMs) - KEEP_MS;
    const keep = this.readings.findIndex((r) => r.atMs >= oldest);
    this.readings = keep < 0 ? [] : this.readings.slice(keep);
  }

  // Mean level in dB over a stretch of time, or undefined if it was silent or unmeasured.
  meanDb(startMs: number, endMs: number): number | undefined {
    const inside = this.readings.filter((r) => r.atMs >= startMs - READING_MS && r.atMs <= endMs);
    return inside.length === 0 ? undefined : inside.reduce((n, r) => n + r.db, 0) / inside.length;
  }
}

// How many words a voice needs before its loudness counts, to pick the user the first time and
// to change a pick already made.
const PICK_WORDS = 8;
const REPICK_WORDS = 15;
// How much louder than the next voice (first pick) or than the current pick (change).
const PICK_DB = 3;
const REPICK_DB = 6;
// Only the latest words: who is loudest now.
const RECENT_WORDS = 200;

// The voice number that is the user's by loudness, or undefined to leave things as they are:
// with nobody picked, the loudest voice with enough words; with someone picked, another voice only
// when it is clearly and consistently louder.
export function pickByLevel(
  words: readonly Word[],
  levels: LevelLog,
  me: number | undefined,
): number | undefined {
  const stats = new Map<number, { n: number; sum: number }>();
  for (const w of words.slice(-RECENT_WORDS)) {
    if (w.speaker === undefined) continue;
    const db = levels.meanDb(w.startMs - AUDIO_DELAY_MS, w.endMs - AUDIO_DELAY_MS);
    if (db === undefined) continue;
    const s = stats.get(w.speaker) ?? { n: 0, sum: 0 };
    stats.set(w.speaker, { n: s.n + 1, sum: s.sum + db });
  }
  const voices = [...stats]
    .map(([speaker, s]) => ({ speaker, n: s.n, db: s.sum / s.n }))
    .sort((a, b) => b.db - a.db);
  const [top, next] = voices.filter((v) => v.n >= PICK_WORDS);
  if (!top || top.speaker === me) return undefined;
  if (me === undefined) return !next || top.db - next.db >= PICK_DB ? top.speaker : undefined;
  const mine = stats.get(me);
  if (!mine || top.n < REPICK_WORDS) return undefined;
  return top.db - mine.sum / mine.n >= REPICK_DB ? top.speaker : undefined;
}
