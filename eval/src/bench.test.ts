import { describe, expect, it } from 'vitest';
import { compare, lastOf, SUITES, type BenchLine } from './bench.js';
import type { ItemResult } from './metrics.js';
import type { ScenarioScore } from './score.js';

const line = (commit: string, metrics: Record<string, number>, suite = 'hard'): BenchLine => ({
  at: '2026-11-11T00:00:00Z',
  commit,
  guesser: 'claude',
  suite,
  metrics,
});

describe('compare', () => {
  it('shows each metric against the previous run, with the change in counts', () => {
    const out = compare(
      line('aaa', { top1: 20, falseOffers: 3 }),
      line('bbb', { top1: 23, falseOffers: 3 }),
    );
    expect(out).toBe('hard [claude] bbb vs aaa: top1 23 (+3), falseOffers 3');
  });

  it('shows a drop with its sign and marks a first run', () => {
    expect(compare(line('aaa', { wrong: 4 }), line('bbb', { wrong: 2 }))).toContain('wrong 2 (-2)');
    expect(compare(undefined, line('bbb', { wrong: 2 }))).toContain('(first run)');
  });
});

describe('lastOf', () => {
  it('finds the latest line of the same suite and guesser', () => {
    const lines = [line('a', {}), line('b', {}, 'live'), line('c', {})];
    expect(lastOf(lines, 'hard', 'claude')?.commit).toBe('c');
    expect(lastOf(lines, 'hard', 'mock')).toBeUndefined();
  });
});

describe('suite summaries', () => {
  const score = (outcome: 'correct' | 'wrong' | 'miss', popups = 0): ScenarioScore =>
    ({
      id: 's',
      type: 't',
      stalls: [{ line: 1, outcome, top1: outcome === 'correct', wrongShown: 0 }],
      fluent: { lines: 10, popups },
      selfRecovered: { lines: 0, popups: 0 },
      other: { lines: 5, popups: 0 },
    }) as unknown as ScenarioScore;

  it('reduces a scenario replay to counts', () => {
    const replay = SUITES[0]?.summary({
      runs: [{ score: score('correct') }, { score: score('wrong', 1) }, { score: score('miss') }],
    });
    expect(replay).toMatchObject({
      stalls: 3,
      correct: 1,
      wrong: 1,
      missed: 1,
      fluentPopups: 1,
      fluentLines: 30,
    });
  });

  it('reduces an item set to counts', () => {
    const item = (over: Partial<ItemResult>): ItemResult =>
      ({
        kind: 'stall',
        detected: true,
        top1: false,
        top3: false,
        abstained: false,
        offered: false,
        falseOffer: false,
        ...over,
      }) as ItemResult;
    const hard = SUITES[1]?.summary({
      results: [
        item({ top1: true, top3: true, offered: true }),
        item({ offered: true, falseOffer: true }),
      ],
    });
    expect(hard).toMatchObject({ stalls: 2, top1: 1, top3: 1, offered: 2, falseOffers: 1 });
  });
});
