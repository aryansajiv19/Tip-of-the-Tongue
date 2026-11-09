import { BYTES_PER_MS, SAMPLE_RATE } from './audio.js';
import { renderLine } from './say.js';

export const NOISE_KINDS = ['cafe', 'keyboard', 'fan'] as const;
export type NoiseKind = (typeof NOISE_KINDS)[number];

// Voices and chatter for the café: three people talking over each other, as real speech, so
// Deepgram may hear words in it (which is what a café does to a transcript).
export const BABBLE_VOICES = ['Daniel', 'Samantha', 'Karen'];
const CHATTER = [
  'so I told her we should probably book the table for Saturday, but she said the kids have a match',
  'did you see the email about the new schedule, I think they moved the whole meeting to Thursday',
  'honestly the coffee here is better than the place near the office, and it is a lot cheaper too',
  'we were going to drive up last weekend but the weather was terrible so we stayed home instead',
];

// Small seeded generator, so a noise track is the same on every run.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toPcm(samples: ArrayLike<number>): Buffer {
  const out = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] ?? 0))), i * 2);
  }
  return out;
}

// Low rumble (brown noise) plus a 100 Hz hum: constant and steady, no sudden sounds.
export function fan(ms: number, seed = 1): Buffer {
  const next = rng(seed);
  const n = Math.round(ms * (BYTES_PER_MS / 2));
  const out = new Float64Array(n);
  let brown = 0;
  for (let i = 0; i < n; i++) {
    brown = brown * 0.98 + (next() - 0.5) * 600;
    out[i] = brown + 1500 * Math.sin((2 * Math.PI * 100 * i) / SAMPLE_RATE);
  }
  return toPcm(out);
}

// Silence with short sharp clicks (a 4 ms decaying burst) every 70-250 ms: sudden and loud for
// their length, which is what makes typing hard on a speech detector.
export function keyboard(ms: number, seed = 1): Buffer {
  const next = rng(seed);
  const n = Math.round(ms * (BYTES_PER_MS / 2));
  const clickLen = 4 * (SAMPLE_RATE / 1000);
  const out = new Float64Array(n);
  for (let at = 0; at < n; at += Math.round((70 + next() * 180) * (SAMPLE_RATE / 1000))) {
    const level = 8000 + next() * 12000;
    for (let j = 0; j < clickLen && at + j < n; j++) {
      out[at + j] = (next() - 0.5) * 2 * level * (1 - j / clickLen) ** 2;
    }
  }
  return toPcm(out);
}

// Each voice speaks the chatter in turn, starting at a different place in it, with short gaps.
export async function cafe(ms: number): Promise<Buffer> {
  const voices = await Promise.all(
    BABBLE_VOICES.map(async (voice, v) => {
      const parts: Buffer[] = [];
      let bytes = 0;
      for (let i = 0; bytes < ms * BYTES_PER_MS; i++) {
        const line = await renderLine(voice, CHATTER[(i + v) % CHATTER.length] ?? '', 0);
        parts.push(line, Buffer.alloc(400 * BYTES_PER_MS));
        bytes += line.length + 400 * BYTES_PER_MS;
      }
      return Buffer.concat(parts);
    }),
  );
  const n = Math.round(ms * (BYTES_PER_MS / 2));
  const sum = new Float64Array(n);
  for (const pcm of voices) {
    for (let i = 0; i < n && i * 2 + 1 < pcm.length; i++)
      sum[i] = (sum[i] ?? 0) + pcm.readInt16LE(i * 2);
  }
  return toPcm(sum);
}

export function makeNoise(kind: NoiseKind, ms: number): Promise<Buffer> {
  return kind === 'cafe' ? cafe(ms) : Promise.resolve(kind === 'fan' ? fan(ms) : keyboard(ms));
}
