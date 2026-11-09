import { describe, expect, it } from 'vitest';
import {
  BYTES_PER_MS,
  durationMs,
  FRAME_BYTES,
  mixAtSnr,
  silence,
  toFrames,
  trimSilence,
  wavToPcm,
} from './audio.js';

const samples = (...values: number[]): Buffer => {
  const b = Buffer.alloc(values.length * 2);
  values.forEach((v, i) => b.writeInt16LE(v, i * 2));
  return b;
};

function wav(pcm: Buffer, extraChunk = false): Buffer {
  const fmt = Buffer.alloc(24);
  fmt.write('fmt ', 0, 'ascii');
  fmt.writeUInt32LE(16, 4);
  const list = extraChunk
    ? Buffer.concat([
        Buffer.from('LIST'),
        Buffer.from([3, 0, 0, 0]),
        Buffer.from('abc'),
        Buffer.from([0]),
      ])
    : Buffer.alloc(0);
  const dataHead = Buffer.alloc(8);
  dataHead.write('data', 0, 'ascii');
  dataHead.writeUInt32LE(pcm.length, 4);
  const body = Buffer.concat([Buffer.from('WAVE'), fmt, list, dataHead, pcm]);
  const head = Buffer.alloc(8);
  head.write('RIFF', 0, 'ascii');
  head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}

describe('wavToPcm', () => {
  it('returns the data chunk', () => {
    const pcm = samples(1, 2, 3);
    expect(wavToPcm(wav(pcm))).toEqual(pcm);
  });
  it('skips chunks it does not need, including an odd-sized one', () => {
    const pcm = samples(9, 8);
    expect(wavToPcm(wav(pcm, true))).toEqual(pcm);
  });
  it('refuses something that is not a WAV file', () => {
    expect(() => wavToPcm(Buffer.from('nope nope nope nope'))).toThrow('not a WAV');
  });
  it('refuses a WAV without sample data', () => {
    const fmtOnly = wav(Buffer.alloc(0)).subarray(0, 36);
    expect(() => wavToPcm(fmtOnly)).toThrow('no data');
  });
});

describe('lengths', () => {
  it('counts 32 bytes to the millisecond', () => {
    expect(silence(100).length).toBe(3200);
    expect(durationMs(silence(250))).toBe(250);
    expect(BYTES_PER_MS).toBe(32);
  });
});

describe('trimSilence', () => {
  it('cuts quiet samples from both ends and keeps the quiet middle', () => {
    const pcm = samples(0, 10, 5000, 0, 0, -4000, 20, 0);
    expect(trimSilence(pcm)).toEqual(samples(5000, 0, 0, -4000));
  });
  it('gives nothing for pure silence or no audio', () => {
    expect(trimSilence(silence(50)).length).toBe(0);
    expect(trimSilence(Buffer.alloc(0)).length).toBe(0);
  });
  it('keeps a single loud sample', () => {
    expect(trimSilence(samples(0, 0, 900, 0))).toEqual(samples(900));
  });
});

describe('toFrames', () => {
  it('cuts audio into 100 ms frames', () => {
    const frames = toFrames(silence(300));
    expect(frames).toHaveLength(3);
    expect(frames.every((f) => f.length === FRAME_BYTES)).toBe(true);
  });
  it('pads a short last frame with silence', () => {
    const frames = toFrames(Buffer.concat([silence(100), samples(7, 7)]));
    expect(frames).toHaveLength(2);
    expect(frames[1]?.length).toBe(FRAME_BYTES);
    expect(frames[1]?.readInt16LE(0)).toBe(7);
    expect(frames[1]?.readInt16LE(FRAME_BYTES - 2)).toBe(0);
  });
  it('gives no frames for no audio', () => {
    expect(toFrames(Buffer.alloc(0))).toEqual([]);
  });
});

describe('mixAtSnr', () => {
  const tone = (n: number, amp: number) =>
    samples(...Array.from({ length: n }, (_, i) => Math.round(amp * Math.sin(i / 3))));
  const rms = (pcm: Buffer) => {
    let e = 0;
    for (let i = 0; i < pcm.length; i += 2) e += pcm.readInt16LE(i) ** 2;
    return Math.sqrt(e / (pcm.length / 2));
  };

  it('puts the noise the asked number of dB below the speech', () => {
    const speech = tone(16000, 8000);
    const noise = samples(...Array.from({ length: 16000 }, (_, i) => ((i * 7919) % 2001) - 1000));
    const mixed = mixAtSnr(speech, noise, 10);
    const added = Buffer.alloc(speech.length);
    for (let i = 0; i < speech.length; i += 2) {
      added.writeInt16LE(mixed.readInt16LE(i) - speech.readInt16LE(i), i);
    }
    expect(20 * Math.log10(rms(speech) / rms(added))).toBeCloseTo(10, 0);
  });

  it('measures the level on the speech, not on the pauses', () => {
    const speech = Buffer.concat([tone(4000, 8000), silence(2000)]);
    const noise = samples(...Array.from({ length: 100 }, (_, i) => (i % 2 ? 500 : -500)));
    const mixed = mixAtSnr(speech, noise, 6);
    const loud = mixed.subarray(0, 8000);
    const gap = mixed.subarray(speech.length - 3200);
    // noise amplitude = speech rms / 10^(6/20), about half; the gap holds that, not a fraction
    expect(rms(gap)).toBeGreaterThan(rms(tone(4000, 8000)) * 0.45);
    expect(rms(loud)).toBeGreaterThan(0);
  });

  it('repeats a short noise to fill the track and keeps the length', () => {
    const mixed = mixAtSnr(tone(800, 8000), samples(100, -100), 0);
    expect(mixed.length).toBe(1600);
  });

  it('clips instead of wrapping when speech is already loud', () => {
    const loud = samples(...Array(400).fill(32000));
    const mixed = mixAtSnr(loud, samples(...Array(400).fill(5000)), -6);
    expect(mixed.readInt16LE(0)).toBe(32767);
  });

  it('leaves silence and silent noise alone', () => {
    expect(mixAtSnr(silence(10), samples(900, -900), 5)).toEqual(silence(10));
    const speech = tone(100, 8000);
    expect(mixAtSnr(speech, silence(10), 5)).toEqual(speech);
  });
});
