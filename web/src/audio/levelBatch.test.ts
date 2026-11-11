import { afterEach, describe, expect, it, vi } from 'vitest';
import { levelBatcher } from './levelBatch';

afterEach(() => vi.useRealTimers());

describe('levelBatcher', () => {
  it('sends readings in groups stamped with the time of the first one', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const sent: [number, number[]][] = [];
    const push = levelBatcher((at, levels) => sent.push([at, levels]), 3);
    push(0.1);
    vi.setSystemTime(1050);
    push(0.2);
    push(0.3);
    vi.setSystemTime(1150);
    push(0.4);
    expect(sent).toEqual([[1000, [0.1, 0.2, 0.3]]]);
    push(0.5);
    push(0.6);
    expect(sent[1]).toEqual([1150, [0.4, 0.5, 0.6]]);
  });
});
