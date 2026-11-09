import { describe, expect, it } from 'vitest';
import type { Word } from '../../../server/src/events.js';
import { durationMs, silence } from './audio.js';
import {
  buildTrack,
  labelStats,
  lineForTime,
  pausePoint,
  silenceBefore,
  TAIL_MS,
  trackTime,
} from './track.js';
import type { Scenario } from '../scenarios.js';

type Line = Scenario['lines'][number];
const speech = (ms: number) => Buffer.alloc(ms * 32, 1);
const rendered = (lines: [Line, number][]) =>
  lines.map(([line, ms]) => ({ line, pcm: speech(ms) }));
const me = (t = 'x', extra: Partial<Line> = {}): Line => ({ s: 'me', t, ...extra });
const other = (t = 'x', extra: Partial<Line> = {}): Line => ({ s: 'other', t, ...extra });

describe('buildTrack', () => {
  it('places lines with the same gaps as the text replay', () => {
    const { placed, pcm } = buildTrack(
      rendered([
        [me(), 1000],
        [other(), 500],
        [me('a', { w: 'pen' }), 800],
        [me(), 300],
      ]),
    );
    expect(placed.map((p) => [p.startMs, p.endMs])).toEqual([
      [500, 1500], // lead-in 500
      [2200, 2700], // turn gap 700
      [3400, 4200], // turn gap 700
      [7200, 7500], // 3000 after a stall line
    ]);
    // the whole track: lead-in, speech, gaps, and the tail
    expect(durationMs(pcm)).toBe(7500 + 700 + TAIL_MS);
  });

  it("honours a line's own gap", () => {
    const { placed } = buildTrack(
      rendered([
        [me('x', { gap: 100 }), 1000],
        [other(), 200],
      ]),
    );
    expect(placed[1]?.startMs).toBe(1600);
  });

  it("leaves out the other person's lines before the user's first, as Start is pressed when they begin", () => {
    const { placed } = buildTrack(
      rendered([
        [other('hello'), 900],
        [me('hi'), 400],
        [other('go on'), 300],
      ]),
    );
    expect(placed.map((p) => p.line.t)).toEqual(['hi', 'go on']);
    expect(placed[0]?.startMs).toBe(500);
  });
});

describe('lineForTime', () => {
  const { placed } = buildTrack(
    rendered([
      [me(), 1000],
      [other(), 500],
      [me(), 800],
    ]),
  );
  it('is the last line that had started, so a pop-up while the user still talks counts for that line', () => {
    expect(lineForTime(placed, 100)).toBe(-1);
    expect(lineForTime(placed, 499)).toBe(-1);
    expect(lineForTime(placed, 500)).toBe(0);
    expect(lineForTime(placed, 1460)).toBe(0);
    // 40 ms before the end of the second line's speech, still that line
    expect(lineForTime(placed, 2660)).toBe(1);
    expect(lineForTime(placed, 99_999)).toBe(2);
  });
});

describe('silenceBefore', () => {
  it('counts from the end of the last word before the moment, never negative', () => {
    expect(silenceBefore([1000, 1400, 2500], 2000)).toBe(600);
    expect(silenceBefore([1000, 1400, 2500], 2500)).toBe(0);
    expect(silenceBefore([1000], 900)).toBe(0);
    expect(silenceBefore([], 900)).toBe(0);
  });
});

describe('trackTime', () => {
  it('is the same as elapsed time without a pause', () => {
    expect(trackTime(1234)).toBe(1234);
  });
  it('stands still during a pause and then runs on from where it stopped', () => {
    const pause = { atMs: 10_000, lenMs: 4500 };
    expect(trackTime(9000, pause)).toBe(9000);
    expect(trackTime(10_000, pause)).toBe(10_000);
    expect(trackTime(12_000, pause)).toBe(10_000);
    expect(trackTime(14_500, pause)).toBe(10_000);
    expect(trackTime(15_500, pause)).toBe(11_000);
  });
});

describe('pausePoint', () => {
  it("is in the gap before the user's first line from the fifth line on", () => {
    const { placed } = buildTrack(
      rendered([
        [me(), 1000],
        [other(), 500],
        [me(), 500],
        [other(), 500],
        [other(), 500],
        [me(), 500],
        [me(), 500],
      ]),
    );
    const p = pausePoint(placed);
    expect(p).toBeDefined();
    expect(p).toBeGreaterThan(placed[4]?.endMs ?? 0);
    expect(p).toBeLessThan(placed[5]?.startMs ?? 0);
  });
  it('is undefined for a short conversation', () => {
    const { placed } = buildTrack(
      rendered([
        [me(), 500],
        [other(), 500],
      ]),
    );
    expect(pausePoint(placed)).toBeUndefined();
  });
});

describe('labelStats', () => {
  const { placed } = buildTrack(
    rendered([
      [me(), 2000],
      [other(), 2000],
    ]),
  );
  // line 0: 500..2500, line 1: 3200..5200 (audio time)
  const w = (text: string, ms: number, speaker?: number): Word => ({
    text,
    startMs: 1_000_000 + ms,
    endMs: 1_000_000 + ms + 100,
    ...(speaker !== undefined ? { speaker } : {}),
  });
  const track = (serverMs: number) => serverMs - 1_000_000;

  it("finds each role's usual voice number and how many words carried it", () => {
    const s = labelStats(
      [w('a', 600, 1), w('b', 900, 1), w('c', 1200, 0), w('d', 3300, 0), w('e', 3600, 0)],
      placed,
      track,
    );
    expect(s.userLabel).toBe(1);
    expect(s.otherLabel).toBe(0);
    expect(s.words).toBe(5);
    expect(s.right).toBe(4);
    expect(s.heard).toEqual(['a b c', 'd e']);
  });

  it('ignores unlabelled words in the count but still hears them', () => {
    const s = labelStats([w('a', 600), w('b', 700, 2)], placed, track);
    expect(s.words).toBe(1);
    expect(s.userLabel).toBe(2);
    expect(s.heard[0]).toBe('a b');
  });

  it('is empty without words', () => {
    const s = labelStats([], placed, track);
    expect(s.userLabel).toBeUndefined();
    expect(s.words).toBe(0);
  });

  it('puts words after a pause on the right line through the track mapping', () => {
    const pause = { atMs: 2600, lenMs: 4500 };
    // A word the server timed at 6000 ms of wall time is at 6000 - 4500 = 1500 on the track.
    const s = labelStats([w('late', 6000, 1)], placed, (ms) => trackTime(ms - 1_000_000, pause));
    expect(s.heard[0]).toBe('late');
  });

  it('keeps silence out of it: a gap does not belong to a line before its start', () => {
    expect(durationMs(silence(10))).toBe(10);
  });
});
