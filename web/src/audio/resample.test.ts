import { describe, expect, it } from 'vitest';
import { Resampler } from './resample';

const CHUNK = 1600;
const TARGET = 16000;
const tone = (hz: number, rate: number, from: number, count: number) =>
  Float32Array.from(
    { length: count },
    (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * (from + i)) / rate),
  );

// Plays `seconds` of a tone through the resampler in the microphone's own 100 ms blocks.
function run(hz: number, rate: number, seconds = 1) {
  const r = new Resampler(rate, TARGET, CHUNK);
  const block = rate / 10;
  const chunks: Float32Array[] = [];
  for (let n = 0; n < seconds * 10; n++) chunks.push(...r.push(tone(hz, rate, n * block, block)));
  return chunks;
}
const flat = (chunks: Float32Array[]) => Float32Array.from(chunks.flatMap((c) => [...c]));

// Output sample k is the input at time k/16000, so compare with the ideal tone, away from the start.
function worstError(hz: number, rate: number): number {
  const out = flat(run(hz, rate));
  let worst = 0;
  for (let k = 200; k < out.length; k++) {
    worst = Math.max(
      worst,
      Math.abs((out[k] ?? 0) - 0.5 * Math.sin((2 * Math.PI * hz * k) / TARGET)),
    );
  }
  return worst;
}
const rms = (a: Float32Array, from = 200) => {
  let s = 0;
  for (let i = from; i < a.length; i++) s += (a[i] ?? 0) ** 2;
  return Math.sqrt(s / (a.length - from));
};

describe('Resampler', () => {
  it.each([48000, 44100, 32000, 22050, 16000, 8000])(
    'keeps a 1 kHz tone at %i Hz, within 1% of full scale',
    (rate) => {
      expect(worstError(1000, rate)).toBeLessThan(0.01);
    },
  );

  it('gives whole chunks of 100 ms for every common rate, steadily', () => {
    for (const rate of [48000, 44100, 22050, 16000, 8000]) {
      const chunks = run(300, rate, 3);
      expect(chunks.every((c) => c.length === CHUNK)).toBe(true);
      // Almost one per input block: only the filter's look-ahead is held back.
      expect(chunks.length).toBeGreaterThanOrEqual(29);
    }
  });

  it('cuts what is above the new Nyquist instead of folding it into the speech', () => {
    // 12 kHz would alias to 4 kHz at 16 kHz; it should be gone, not heard.
    expect(rms(flat(run(12000, 48000)))).toBeLessThan(0.5 * 0.0316);
    expect(rms(flat(run(20000, 44100)))).toBeLessThan(0.5 * 0.0316);
    // And a 6 kHz tone, well inside the speech band the recogniser uses, still comes through.
    expect(rms(flat(run(6000, 48000)))).toBeGreaterThan(0.5 * 0.707 * 0.9);
  });

  it('is the same whatever the size of the blocks fed in', () => {
    const rate = 44100;
    const all = tone(440, rate, 0, rate);
    const whole = flat(new Resampler(rate, TARGET, CHUNK).push(all));
    const r = new Resampler(rate, TARGET, CHUNK);
    const pieces: Float32Array[] = [];
    for (let at = 0, size = 97; at < all.length; at += size, size = (size * 3) % 1500 || 97) {
      pieces.push(...r.push(all.subarray(at, at + size)));
    }
    const parts = flat(pieces);
    expect(parts.length).toBeGreaterThan(0);
    for (let k = 0; k < parts.length; k++) expect(parts[k]).toBeCloseTo(whole[k] ?? NaN, 5);
  });

  it('keeps a steady level, and silence stays silence', () => {
    const r = new Resampler(48000, TARGET, CHUNK);
    const out = flat(r.push(new Float32Array(48000).fill(0.25)));
    expect(out[500]).toBeCloseTo(0.25, 3);
    const quiet = flat(new Resampler(8000, TARGET, CHUNK).push(new Float32Array(8000)));
    expect(quiet.every((v) => v === 0)).toBe(true);
  });
});
