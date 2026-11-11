import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { trimSilence, wavToPcm } from './audio.js';

const run = promisify(execFile);

// The voices the user can be given, and a contrasting voice for the other person (a different
// gender and accent, which is the easy case for telling voices apart).
export const USER_VOICES = ['Daniel', 'Samantha', 'Karen', 'Moira', 'Rishi', 'Tessa'];
const MALE = new Set(['Daniel', 'Rishi', 'Fred']);
export const otherVoiceFor = (user: string): string => (MALE.has(user) ? 'Samantha' : 'Daniel');

// Up to three other people, each a voice unlike the user's and unlike each other: the usual
// contrasting voice first, then the others in turn.
const OTHER_POOL = ['Samantha', 'Daniel', 'Karen', 'Fred', 'Tessa', 'Moira'];
export const otherVoicesFor = (user: string, count = 1): string[] =>
  [otherVoiceFor(user), ...OTHER_POOL.filter((v) => v !== user && v !== otherVoiceFor(user))].slice(
    0,
    count,
  );

// The text `say` speaks: each "..." becomes real silence of `pauseMs`.
export function speechText(text: string, pauseMs: number): string {
  return text.replace(/\s*\.\.\.\s*/g, ` [[slnc ${pauseMs}]] `).trim();
}

export async function installedVoices(): Promise<Set<string>> {
  const { stdout } = await run('say', ['-v', '?']);
  return new Set(stdout.split('\n').map((l) => l.split(/\s{2,}/)[0]?.trim() ?? ''));
}

// `rate` is in words per minute (say's default is about 175). Without it the key is what it was
// before rates existed, so earlier renderings stay valid.
export const cacheKey = (voice: string, spoken: string, rate?: number): string =>
  createHash('sha1')
    .update(`${voice}|${spoken}${rate === undefined ? '' : `|${rate}`}`)
    .digest('hex');

export const sayArgs = (voice: string, file: string, spoken: string, rate?: number): string[] => [
  '-v',
  voice,
  ...(rate === undefined ? [] : ['-r', String(rate)]),
  '-o',
  file,
  '--data-format=LEI16@16000',
  '--',
  spoken,
];

const CACHE = join(tmpdir(), 'tott-live-scenarios');

// One line of speech as 16 kHz PCM, trimmed of the silence the voice adds at both ends. Cached,
// so a second run does not speak everything again.
export async function renderLine(
  voice: string,
  text: string,
  pauseMs: number,
  rate?: number,
): Promise<Buffer> {
  const spoken = speechText(text, pauseMs);
  const file = join(CACHE, `${cacheKey(voice, spoken, rate)}.wav`);
  if (!existsSync(file)) {
    await mkdir(CACHE, { recursive: true });
    await run('say', sayArgs(voice, file, spoken, rate));
  }
  return trimSilence(wavToPcm(await readFile(file)));
}
