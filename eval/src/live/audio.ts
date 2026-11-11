// 16 kHz, 16-bit mono PCM: 32 bytes per millisecond.
export const SAMPLE_RATE = 16_000;
export const BYTES_PER_MS = 32;
// What the browser sends: 100 ms per frame.
export const FRAME_MS = 100;
export const FRAME_BYTES = FRAME_MS * BYTES_PER_MS;

// The sample data of a WAV file (what `say -o x.wav --data-format=LEI16@16000` writes).
export function wavToPcm(wav: Buffer): Buffer {
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('not a WAV file');
  }
  let at = 12;
  while (at + 8 <= wav.length) {
    const id = wav.toString('ascii', at, at + 4);
    const size = wav.readUInt32LE(at + 4);
    if (id === 'data') return wav.subarray(at + 8, Math.min(wav.length, at + 8 + size));
    at += 8 + size + (size % 2);
  }
  throw new Error('WAV file has no data chunk');
}

export const silence = (ms: number): Buffer => Buffer.alloc(Math.round(ms) * BYTES_PER_MS);

export const durationMs = (pcm: Buffer): number => pcm.length / BYTES_PER_MS;

// Cuts the near-silent start and end that a text-to-speech voice adds, so a line's length is the
// length of its speech. Silence inside the line (a pause on purpose) is kept.
export function trimSilence(pcm: Buffer, threshold = 300): Buffer {
  const samples = pcm.length >> 1;
  const loud = (i: number) => Math.abs(pcm.readInt16LE(i * 2)) > threshold;
  let first = 0;
  while (first < samples && !loud(first)) first++;
  if (first === samples) return Buffer.alloc(0);
  let last = samples - 1;
  while (last > first && !loud(last)) last--;
  return pcm.subarray(first * 2, (last + 1) * 2);
}

const clip = (v: number): number => Math.max(-32768, Math.min(32767, Math.round(v)));

// The same audio `db` louder (negative: quieter).
export function scaleDb(pcm: Buffer, db: number): Buffer {
  const gain = 10 ** (db / 20);
  const out = Buffer.alloc(pcm.length);
  for (let i = 0; i + 1 < pcm.length; i += 2) out.writeInt16LE(clip(pcm.readInt16LE(i) * gain), i);
  return out;
}

// One second-order filter section (Audio EQ Cookbook, Q = 0.707), run over the whole buffer.
function biquad(pcm: Buffer, kind: 'high' | 'low', hz: number): Buffer {
  const w = (2 * Math.PI * hz) / SAMPLE_RATE;
  const alpha = Math.sin(w) / (2 * Math.SQRT1_2);
  const cos = Math.cos(w);
  const a0 = 1 + alpha;
  const b0 = (kind === 'high' ? 1 + cos : 1 - cos) / 2 / a0;
  const b1 = (kind === 'high' ? -(1 + cos) : 1 - cos) / a0;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  const out = Buffer.alloc(pcm.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i + 1 < pcm.length; i += 2) {
    const x = pcm.readInt16LE(i);
    const y = b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    out.writeInt16LE(clip(y), i);
  }
  return out;
}

// What a voice sounds like coming out of a phone or laptop speaker: only about 300-3400 Hz (two
// sections each side, so the edges are steep).
export function bandLimit(pcm: Buffer, lowHz = 300, highHz = 3400): Buffer {
  return biquad(
    biquad(biquad(biquad(pcm, 'high', lowHz), 'high', lowHz), 'low', highHz),
    'low',
    highHz,
  );
}

// The level (RMS, 0 to 1) of each 50 ms of audio, as the page measures and sends it.
export function levelsOf(pcm: Buffer, readingMs = 50): number[] {
  const size = readingMs * BYTES_PER_MS;
  const levels: number[] = [];
  for (let at = 0; at + size <= pcm.length; at += size) {
    let sum = 0;
    for (let i = at; i < at + size; i += 2) sum += pcm.readInt16LE(i) ** 2;
    levels.push(Math.sqrt(sum / (size / 2)) / 32768);
  }
  return levels;
}

// Splits audio into 100 ms frames; a short last frame is padded with silence.
export function toFrames(pcm: Buffer): Buffer[] {
  const frames: Buffer[] = [];
  for (let at = 0; at < pcm.length; at += FRAME_BYTES) {
    const frame = pcm.subarray(at, at + FRAME_BYTES);
    frames.push(
      frame.length === FRAME_BYTES
        ? frame
        : Buffer.concat([frame, Buffer.alloc(FRAME_BYTES - frame.length)]),
    );
  }
  return frames;
}

// Root-mean-square level of the loud samples only, so a long pause in a track does not lower it.
function speechRms(pcm: Buffer, threshold = 300): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i + 1 < pcm.length; i += 2) {
    const v = pcm.readInt16LE(i);
    if (Math.abs(v) > threshold) {
      sum += v * v;
      n++;
    }
  }
  return n === 0 ? 0 : Math.sqrt(sum / n);
}

// Adds `noise` (repeated to fill the track) at `snrDb` below the speech level. Sample count and
// timing are unchanged, so line positions on the track stay valid.
export function mixAtSnr(speech: Buffer, noise: Buffer, snrDb: number): Buffer {
  const noiseSamples = noise.length >> 1;
  let energy = 0;
  for (let i = 0; i < noiseSamples; i++) energy += noise.readInt16LE(i * 2) ** 2;
  const noiseRms = Math.sqrt(energy / (noiseSamples || 1));
  const rms = speechRms(speech);
  if (noiseRms === 0 || rms === 0) return speech;
  const gain = rms / (noiseRms * 10 ** (snrDb / 20));
  const out = Buffer.alloc(speech.length);
  for (let i = 0; i < speech.length >> 1; i++) {
    const mixed = speech.readInt16LE(i * 2) + noise.readInt16LE((i % noiseSamples) * 2) * gain;
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(mixed))), i * 2);
  }
  return out;
}
