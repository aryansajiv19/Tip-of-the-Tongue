import { describe, expect, it } from 'vitest';
import { BAR_COUNT, barHeights } from './levelBars';

describe('barHeights', () => {
  it('has five bars', () => {
    expect(barHeights(0.05, true)).toHaveLength(5);
    expect(BAR_COUNT).toBe(5);
  });

  it('rests at a small dot when silent or paused', () => {
    expect(barHeights(0, true)).toEqual(Array(5).fill(0.14));
    expect(barHeights(0.5, false)).toEqual(Array(5).fill(0.14));
  });

  it('grows with the level, middle bar tallest, edges shortest', () => {
    const quiet = barHeights(0.02, true);
    const loud = barHeights(0.05, true);
    quiet.forEach((h, i) => expect(loud[i]).toBeGreaterThan(h));
    expect(loud[2]).toBeGreaterThan(loud[1] as number);
    expect(loud[1]).toBe(loud[3]);
    expect(loud[0]).toBe(loud[4]);
    expect(loud[1]).toBeGreaterThan(loud[0] as number);
  });

  it('tops out at full height however loud', () => {
    expect(barHeights(0.08, true)[2]).toBeCloseTo(1);
    expect(barHeights(5, true)[2]).toBeCloseTo(1);
  });

  it('ignores a negative or broken level', () => {
    expect(barHeights(-1, true)).toEqual(Array(5).fill(0.14));
  });
});
