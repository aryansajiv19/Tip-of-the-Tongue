import { describe, expect, it } from 'vitest';
import {
  detectionTime,
  detectorFalseTriggerRate,
  falseTriggerRate,
  groupBy,
  latency,
  percentile,
  wilson,
  summarizeStalls,
  type ItemResult,
} from './metrics.js';

const stall = (over: Partial<ItemResult> = {}): ItemResult => ({
  id: 'x',
  category: 'object',
  kind: 'stall',
  detected: true,
  detectAfterMs: 500,
  top1: true,
  top3: true,
  abstained: false,
  offered: true,
  falseOffer: false,
  noise: undefined,
  target: 'pharmacy',
  guessed: [],
  offeredWords: [],
  latencyMs: 100,
  ...over,
});
const silent = (offered: boolean): ItemResult =>
  stall({
    kind: 'silent',
    category: 'not_stuck',
    top1: false,
    top3: false,
    offered,
    falseOffer: offered,
  });

describe('wilson', () => {
  it('matches hand-computed 95% intervals', () => {
    const a = wilson({ hits: 30, total: 32 });
    expect(a?.low).toBeCloseTo(0.7985, 3);
    expect(a?.high).toBeCloseTo(0.9827, 3);
    const b = wilson({ hits: 8, total: 9 });
    expect(b?.low).toBeCloseTo(0.5645, 3);
    expect(b?.high).toBeCloseTo(0.9801, 3);
  });
  it('stays inside 0..1 and is not degenerate at 0 or all', () => {
    const none = wilson({ hits: 0, total: 6 });
    expect(none?.low).toBe(0);
    expect(none?.high).toBeCloseTo(0.3903, 3);
    const all = wilson({ hits: 6, total: 6 });
    expect(all?.low).toBeCloseTo(0.6097, 3);
    expect(all?.high).toBeCloseTo(1, 10);
  });
  it('is undefined with no trials', () => {
    expect(wilson({ hits: 0, total: 0 })).toBeUndefined();
  });
});

describe('percentile', () => {
  it('uses nearest rank', () => {
    const v = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(v, 50)).toBe(50);
    expect(percentile(v, 95)).toBe(100);
    expect(percentile(v, 10)).toBe(10);
  });
  it('does not need sorted input and does not mutate it', () => {
    const v = [3, 1, 2];
    expect(percentile(v, 50)).toBe(2);
    expect(v).toEqual([3, 1, 2]);
  });
  it('handles one value, p0 and p100', () => {
    expect(percentile([7], 50)).toBe(7);
    expect(percentile([7], 95)).toBe(7);
    expect(percentile([1, 2, 3], 0)).toBe(1);
    expect(percentile([1, 2, 3], 100)).toBe(3);
  });
  it('is undefined for an empty list', () => {
    expect(percentile([], 50)).toBeUndefined();
  });
});

describe('summarizeStalls', () => {
  it('counts hits against the right denominators', () => {
    const s = summarizeStalls([
      stall(),
      stall({ top1: false, offered: true, falseOffer: true }),
      stall({ top1: false, top3: true, offered: false }),
      stall({ top1: false, top3: false, abstained: true, offered: false }),
      silent(true),
    ]);
    expect(s.n).toBe(4);
    expect(s.top1).toEqual({ hits: 1, total: 4 });
    expect(s.top3).toEqual({ hits: 3, total: 4 });
    expect(s.abstain).toEqual({ hits: 1, total: 4 });
    expect(s.offered).toEqual({ hits: 2, total: 4 });
    expect(s.falseOffer).toEqual({ hits: 1, total: 2 });
  });
  it('gives zero totals for an empty split instead of dividing by zero', () => {
    const s = summarizeStalls([]);
    expect(s.n).toBe(0);
    expect(s.top1).toEqual({ hits: 0, total: 0 });
    expect(s.falseOffer).toEqual({ hits: 0, total: 0 });
  });
  it('has no false-offer denominator when nothing was offered', () => {
    expect(summarizeStalls([stall({ offered: false })]).falseOffer).toEqual({ hits: 0, total: 0 });
  });
});

describe('falseTriggerRate', () => {
  it('counts offers on silent items only', () => {
    expect(falseTriggerRate([silent(false), silent(true), silent(false), stall()])).toEqual({
      hits: 1,
      total: 3,
    });
  });
  it('is 0/0 with no silent items', () => {
    expect(falseTriggerRate([stall()])).toEqual({ hits: 0, total: 0 });
  });
});

describe('detector metrics', () => {
  it('counts the detector hit rate over stall items', () => {
    const s = summarizeStalls([stall(), stall({ detected: false, offered: false }), silent(false)]);
    expect(s.detected).toEqual({ hits: 1, total: 2 });
  });
  it('counts detector false triggers on not_stuck items only', () => {
    const fluent = (detected: boolean) => ({ ...silent(false), detected });
    const selfRecovered = { ...silent(false), category: 'self_recovered', detected: true };
    expect(
      detectorFalseTriggerRate([
        fluent(true),
        fluent(false),
        fluent(false),
        selfRecovered,
        stall(),
      ]),
    ).toEqual({
      hits: 1,
      total: 3,
    });
  });
  it('is 0/0 with no fluent items', () => {
    expect(detectorFalseTriggerRate([])).toEqual({ hits: 0, total: 0 });
  });
});

describe('detectionTime', () => {
  it('takes the median over items that were detected, negatives included', () => {
    const rs = [
      stall({ detectAfterMs: -100 }),
      stall({ detectAfterMs: 400 }),
      stall({ detectAfterMs: undefined }),
    ];
    expect(detectionTime(rs)).toEqual({ p50: -100 });
  });
  it('is undefined when nothing was detected', () => {
    expect(detectionTime([])).toEqual({ p50: undefined });
  });
});

describe('latency', () => {
  it('reports p50 and p95', () => {
    const rs = Array.from({ length: 20 }, (_, i) => stall({ latencyMs: (i + 1) * 10 }));
    expect(latency(rs)).toEqual({ p50: 100, p95: 190 });
  });
  it('is empty for no results', () => {
    expect(latency([])).toEqual({ p50: undefined, p95: undefined });
  });
  it('skips items where no guess was made', () => {
    expect(latency([stall({ latencyMs: undefined }), stall({ latencyMs: 40 })])).toEqual({
      p50: 40,
      p95: 40,
    });
  });
});

describe('groupBy', () => {
  it('groups rows and keeps order', () => {
    const g = groupBy([1, 2, 3, 4], (n) => (n % 2 ? 'odd' : 'even'));
    expect(g.get('odd')).toEqual([1, 3]);
    expect(g.get('even')).toEqual([2, 4]);
  });
});
