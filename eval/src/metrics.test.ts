import { describe, expect, it } from 'vitest';
import {
  falseTriggerRate,
  groupBy,
  latency,
  percentile,
  summarizeStalls,
  type ItemResult,
} from './metrics.js';

const stall = (over: Partial<ItemResult> = {}): ItemResult => ({
  id: 'x',
  category: 'object',
  kind: 'stall',
  top1: true,
  top3: true,
  abstained: false,
  offered: true,
  falseOffer: false,
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

describe('latency', () => {
  it('reports p50 and p95', () => {
    const rs = Array.from({ length: 20 }, (_, i) => stall({ latencyMs: (i + 1) * 10 }));
    expect(latency(rs)).toEqual({ p50: 100, p95: 190 });
  });
  it('is empty for no results', () => {
    expect(latency([])).toEqual({ p50: undefined, p95: undefined });
  });
});

describe('groupBy', () => {
  it('groups rows and keeps order', () => {
    const g = groupBy([1, 2, 3, 4], (n) => (n % 2 ? 'odd' : 'even'));
    expect(g.get('odd')).toEqual([1, 3]);
    expect(g.get('even')).toEqual([2, 4]);
  });
});
