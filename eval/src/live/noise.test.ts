import { describe, expect, it } from 'vitest';
import { BYTES_PER_MS } from './audio.js';
import { fan, keyboard } from './noise.js';

function stats(pcm: Buffer) {
  let e = 0;
  let peak = 0;
  for (let i = 0; i < pcm.length; i += 2) {
    const v = pcm.readInt16LE(i);
    e += v * v;
    peak = Math.max(peak, Math.abs(v));
  }
  return { rms: Math.sqrt(e / (pcm.length / 2)), peak };
}

describe('noise beds', () => {
  it('have the length asked for and are the same on every run', () => {
    expect(fan(500).length).toBe(500 * BYTES_PER_MS);
    expect(keyboard(500).length).toBe(500 * BYTES_PER_MS);
    expect(keyboard(500, 3)).toEqual(keyboard(500, 3));
    expect(keyboard(500, 3)).not.toEqual(keyboard(500, 4));
  });
  it('a fan is steady and typing is sudden', () => {
    const f = stats(fan(3000));
    const k = stats(keyboard(3000));
    expect(f.rms).toBeGreaterThan(0);
    // crest factor (peak over rms): low for a hum, high for clicks between silence
    expect(f.peak / f.rms).toBeLessThan(5);
    expect(k.peak / k.rms).toBeGreaterThan(8);
  });
});
