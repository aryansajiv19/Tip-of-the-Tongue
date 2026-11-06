import { describe, expect, it } from 'vitest';
import { initialVad, MIN_HOLD_MS, stepVad, type Vad } from './vad';

const FRAME = 50;

// Plays a list of [rms, durationMs] segments through the detector, 50 ms frames, and returns
// every change it reports.
function play(segments: [number, number][], start: Vad = initialVad, t0 = 0) {
  let vad = start;
  let t = t0;
  const changes: { voiced: boolean; atMs: number }[] = [];
  for (const [rms, ms] of segments) {
    for (let i = 0; i < ms / FRAME; i++) {
      const r = stepVad(vad, rms, t);
      vad = r.vad;
      if (r.change) changes.push(r.change);
      t += FRAME;
    }
  }
  return { vad, changes, end: t };
}

const QUIET = 0.005;
const SPEECH = 0.15;

describe('stepVad', () => {
  it('reports speech starting and stopping, once each', () => {
    const { changes } = play([
      [QUIET, 1000],
      [SPEECH, 1000],
      [QUIET, 1000],
    ]);
    expect(changes.map((c) => c.voiced)).toEqual([true, false]);
  });

  it('back-dates each change to when it began, not when it was confirmed', () => {
    const { changes } = play([
      [QUIET, 1000],
      [SPEECH, 1000],
      [QUIET, 1000],
    ]);
    expect(changes[0]?.atMs).toBe(1000);
    expect(changes[1]?.atMs).toBe(2000);
  });

  it('ignores a burst shorter than the minimum (a click or a cough)', () => {
    const { changes } = play([
      [QUIET, 1000],
      [SPEECH, MIN_HOLD_MS - FRAME],
      [QUIET, 1000],
    ]);
    expect(changes).toEqual([]);
  });

  it('accepts speech that lasts the minimum', () => {
    const { changes } = play([
      [QUIET, 1000],
      [SPEECH, MIN_HOLD_MS + FRAME],
      [QUIET, 1000],
    ]);
    expect(changes[0]).toEqual({ voiced: true, atMs: 1000 });
  });

  it('does not flap when the level alternates every frame', () => {
    const flap: [number, number][] = Array.from({ length: 40 }, (_, i) => [
      i % 2 ? SPEECH : QUIET,
      FRAME,
    ]);
    expect(play([[QUIET, 1000], ...flap]).changes).toEqual([]);
  });

  it('does not drop out of speech for a short dip between words', () => {
    const { changes } = play([
      [QUIET, 1000],
      [SPEECH, 1000],
      [QUIET, MIN_HOLD_MS - FRAME],
      [SPEECH, 1000],
      [QUIET, 1000],
    ]);
    expect(changes.map((c) => c.voiced)).toEqual([true, false]);
  });

  it('uses hysteresis: a level between the two thresholds keeps the current state', () => {
    // 0.016 is above the "stay voiced" level but below the "become voiced" level.
    const idle = play([
      [QUIET, 1000],
      [0.016, 2000],
    ]);
    expect(idle.changes).toEqual([]);
    const talking = play([
      [QUIET, 1000],
      [SPEECH, 200],
      [0.016, 500],
    ]);
    expect(talking.changes.map((c) => c.voiced)).toEqual([true]);
  });

  it('learns a noisy room: steady background is not speech, and speech over it is', () => {
    const NOISE = 0.04;
    const { changes } = play([
      [QUIET, 500],
      [NOISE, 9000], // the room gets loud
      [0.25, 1000], // someone speaks over it
      [NOISE, 3000],
    ]);
    // The jump from quiet to noise may register as sound at first, but it must settle to silence
    // and speech must still be heard on top of it.
    const last = changes.slice(-2);
    expect(last.map((c) => c.voiced)).toEqual([true, false]);
    const speech = changes.find((c) => c.atMs >= 9500);
    expect(speech?.voiced).toBe(true);
  });

  it('a room that stays loud for a long time stops counting as sound', () => {
    const { changes, vad } = play([
      [QUIET, 500],
      [0.06, 20_000],
    ]);
    expect(vad.voiced).toBe(false);
    expect(changes.at(-1)?.voiced).toBe(false);
  });

  it('speech does not raise the floor, so a long monologue stays voiced', () => {
    const { vad, changes } = play([
      [QUIET, 500],
      [SPEECH, 6000],
    ]);
    expect(vad.voiced).toBe(true);
    expect(changes.map((c) => c.voiced)).toEqual([true]);
  });

  it('does not report digital silence or NaN as sound', () => {
    expect(play([[0, 2000]]).changes).toEqual([]);
    expect(stepVad(initialVad, Number.NaN, 0).change).toBeUndefined();
  });

  it('a very quiet room still needs a real level to count as sound', () => {
    expect(
      play([
        [0, 1000],
        [0.012, 1000],
      ]).changes,
    ).toEqual([]);
  });
});
