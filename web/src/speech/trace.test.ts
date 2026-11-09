import { describe, expect, it } from 'vitest';
import { MAX_TRACE_ENTRIES, pushTrace } from './trace';

describe('pushTrace', () => {
  it('keeps every entry up to the limit', () => {
    const trace: number[] = [];
    for (let i = 0; i < MAX_TRACE_ENTRIES; i++) pushTrace(trace, i);
    expect(trace).toHaveLength(MAX_TRACE_ENTRIES);
    expect(trace[0]).toBe(0);
  });

  it('then drops the oldest, so a long session keeps the latest 500', () => {
    const trace: number[] = [];
    for (let i = 0; i < 2000; i++) pushTrace(trace, i);
    expect(trace).toHaveLength(500);
    expect(trace[0]).toBe(1500);
    expect(trace.at(-1)).toBe(1999);
  });
});
