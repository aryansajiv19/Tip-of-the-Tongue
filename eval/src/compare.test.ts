import { describe, expect, it } from 'vitest';
import { compareRuns } from './compare.js';
import type { ItemResult } from './metrics.js';

const r = (over: Partial<ItemResult>): ItemResult => ({
  id: 'x',
  category: 'work',
  kind: 'stall',
  detected: true,
  detectAfterMs: 0,
  noise: undefined,
  top1: true,
  top3: true,
  abstained: false,
  offered: true,
  falseOffer: false,
  target: 't',
  guessed: [],
  offeredWords: [],
  latencyMs: 1,
  ...over,
});

describe('compareRuns', () => {
  it('puts both runs side by side per category and overall', () => {
    const clean = [r({}), r({}), r({ category: 'profile' })];
    const worse = [
      r({ top1: false, falseOffer: true }),
      r({}),
      r({ category: 'profile', detected: false }),
    ];
    const table = compareRuns(
      { label: 'clean', results: clean },
      { label: 'noisy', results: worse },
    );
    expect(table).toContain(
      '| work | 2 | 100% (2/2) | 100% (2/2) | 100% (2/2) | 50% (1/2) | 0% (0/2) | 50% (1/2) |',
    );
    expect(table).toContain('| profile | 1 | 100% (1/1) | 0% (0/1) |');
    expect(table).toContain('| All | 3 |');
  });

  it('ignores silent items and shows n/a for an empty category in B', () => {
    const table = compareRuns(
      { label: 'a', results: [r({}), r({ kind: 'silent', category: 'not_stuck' })] },
      { label: 'b', results: [] },
    );
    expect(table).toContain('| work | 1 | 100% (1/1) | n/a |');
    expect(table).not.toContain('not_stuck');
  });
});
