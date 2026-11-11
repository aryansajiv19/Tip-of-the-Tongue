import { describe, expect, it } from 'vitest';
import type { Word } from '../events.js';
import { LevelLog, pickByLevel } from './loudness.js';

// Words of one voice, 300 ms apart, and the level readings for them (100 ms earlier).
const voice = (speaker: number, count: number, from: number): Word[] =>
  Array.from({ length: count }, (_, i) => ({
    text: 'w',
    startMs: from + i * 300,
    endMs: from + i * 300 + 250,
    speaker,
  }));
const loudness = (...parts: [from: number, count: number, rms: number][]): LevelLog => {
  const log = new LevelLog();
  for (const [from, count, rms] of parts) log.add(from - 100, Array(count * 6).fill(rms));
  return log;
};

describe('LevelLog', () => {
  it('averages in dB over a stretch and ignores silence', () => {
    const log = new LevelLog();
    log.add(1000, [0.1, 0.1, 0, 0.01]);
    expect(log.meanDb(1000, 1100)).toBeCloseTo(-20, 0); // 0.1 is -20 dB; the silent reading is left out
    expect(log.meanDb(5000, 6000)).toBeUndefined();
  });
  it('forgets readings older than two minutes', () => {
    const log = new LevelLog();
    log.add(0, [0.1]);
    log.add(200_000, [0.1]);
    expect(log.meanDb(0, 100)).toBeUndefined();
    expect(log.meanDb(200_000, 200_100)).toBeCloseTo(-20, 0);
  });
});

describe('pickByLevel', () => {
  const quiet = voice(1, 10, 0);
  const loud = voice(0, 10, 4000);
  const log = loudness([0, 10, 0.02], [4000, 10, 0.2]);

  it('picks the louder voice once it has 8 words', () => {
    expect(pickByLevel([...quiet, ...loud], log, undefined)).toBe(0);
  });
  it('waits for 8 words and for 3 dB over the next voice', () => {
    expect(pickByLevel([...quiet, ...voice(0, 7, 4000)], log, undefined)).toBe(1); // 7 words: not yet a voice
    const close = loudness([0, 10, 0.1], [4000, 10, 0.11]);
    expect(pickByLevel([...quiet, ...loud], close, undefined)).toBeUndefined();
  });
  it('changes an existing pick only for a voice at least 3 dB louder than it', () => {
    const l = (user: number) => loudness([0, 10, user], [4000, 10, 0.2]);
    expect(pickByLevel([...quiet, ...loud], l(0.02), 1)).toBe(0);
    expect(pickByLevel([...quiet, ...loud], l(0.18), 1)).toBeUndefined(); // about 1 dB apart
  });
  it('ignores words with no voice label or no reading', () => {
    const unlabelled = loud.map((w) => ({ text: w.text, startMs: w.startMs, endMs: w.endMs }));
    expect(pickByLevel(unlabelled, log, undefined)).toBeUndefined();
    expect(pickByLevel(loud, new LevelLog(), undefined)).toBeUndefined();
  });
});
