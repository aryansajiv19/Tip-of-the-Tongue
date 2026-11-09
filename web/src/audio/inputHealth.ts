// Notices when what the microphone hears and what comes back as words do not fit together:
// a microphone muted at the OS, speech so quiet it never becomes words (as in hypophonia), or
// plenty of sound with no words at all (music, noise, a language the recogniser is not set to).
// Pure: feed it microphone levels and word arrivals, ask what is wrong.
// ponytail: the thresholds below are measured guesses (0.03 RMS is a quiet talking voice on a
// laptop microphone with gain control off); tune them from real recordings.

export type InputHealth = 'ok' | 'silent' | 'faint' | 'unheard';

// How often the page reads the level.
export const READING_MS = 50;
// Digital silence: what a muted microphone delivers. A real room, however quiet, is above it.
const DIGITAL_ZERO = 0.0002;
const SILENT_MS = 10_000;
// A voice at normal strength passes this; quieter than that is faint.
const SOUND = 0.03;
// How far back faint speech and unexplained sound are judged.
const WINDOW_S = 10;
// Words arrive in pieces (partials), so a few arrivals mean someone is speaking.
const MIN_WORD_ARRIVALS = 3;
// This much sound in the window with no words at all.
const UNHEARD_MS = 6000;

interface Bucket {
  second: number;
  peak: number;
  // Time spent above SOUND.
  loudMs: number;
  words: number;
}

export interface Health {
  buckets: Bucket[];
  // Since when every reading has been digital silence.
  silentSinceMs?: number;
}

export const initialHealth: Health = { buckets: [] };

function bucketFor(h: Health, nowMs: number): { buckets: Bucket[]; current: Bucket } {
  const second = Math.floor(nowMs / 1000);
  const kept = h.buckets.filter((b) => b.second > second - WINDOW_S);
  const last = kept.at(-1);
  if (last?.second === second) return { buckets: kept, current: last };
  const current: Bucket = { second, peak: 0, loudMs: 0, words: 0 };
  return { buckets: [...kept, current], current };
}

// `rms`: the microphone level, 0 to 1, as read every READING_MS.
export function noteLevel(h: Health, rms: number, nowMs: number): Health {
  const level = Number.isFinite(rms) ? rms : 0;
  const { buckets, current } = bucketFor(h, nowMs);
  const updated = {
    ...current,
    peak: Math.max(current.peak, level),
    loudMs: current.loudMs + (level > SOUND ? READING_MS : 0),
  };
  const silent = level < DIGITAL_ZERO;
  const silentSinceMs = silent ? (h.silentSinceMs ?? nowMs) : undefined;
  return {
    buckets: [...buckets.slice(0, -1), updated],
    ...(silentSinceMs !== undefined ? { silentSinceMs } : {}),
  };
}

// Words (or partial words) arrived from the recogniser.
export function noteWords(h: Health, nowMs: number): Health {
  const { buckets, current } = bucketFor(h, nowMs);
  return {
    ...h,
    buckets: [...buckets.slice(0, -1), { ...current, words: current.words + 1 }],
  };
}

export function inputHealth(h: Health, nowMs: number): InputHealth {
  if (h.silentSinceMs !== undefined && nowMs - h.silentSinceMs >= SILENT_MS) return 'silent';
  const recent = h.buckets.filter((b) => b.second > Math.floor(nowMs / 1000) - WINDOW_S);
  // Judged only once a full window has been listened to, so a pause in listening or the first
  // seconds after Start never raise a warning.
  const first = recent[0]?.second;
  if (first === undefined || Math.floor(nowMs / 1000) - first < WINDOW_S - 2) return 'ok';
  const words = recent.reduce((n, b) => n + b.words, 0);
  const peak = Math.max(...recent.map((b) => b.peak));
  const loudMs = recent.reduce((n, b) => n + b.loudMs, 0);
  if (words >= MIN_WORD_ARRIVALS && peak < SOUND) return 'faint';
  if (words === 0 && loudMs >= UNHEARD_MS) return 'unheard';
  return 'ok';
}

export function healthMessage(health: InputHealth): string {
  switch (health) {
    case 'silent':
      return 'I can’t hear anything. Is the microphone muted?';
    case 'faint':
      return 'Your voice is very quiet. Move closer to the microphone or speak up a little.';
    case 'unheard':
      return 'I hear sound but no words. Check the microphone, or whether it is noise or music.';
    case 'ok':
      return '';
  }
}
