export interface Rate {
  hits: number;
  total: number;
}

// What happened to one item. `kind` says whether the system should have helped or stayed silent.
export interface ItemResult {
  id: string;
  category: string;
  kind: 'stall' | 'silent';
  // The stuck detector fired, so the guesser was called.
  detected: boolean;
  top1: boolean;
  top3: boolean;
  abstained: boolean;
  offered: boolean;
  // Offered, but none of the offered words is acceptable. Always true for an offer on a silent item.
  falseOffer: boolean;
  // Undefined when the detector did not fire and no guess was made.
  latencyMs: number | undefined;
}

export interface StallSummary {
  n: number;
  detected: Rate;
  top1: Rate;
  top3: Rate;
  abstain: Rate;
  offered: Rate;
  // Of the offers made, how many were wrong.
  falseOffer: Rate;
}

const rate = (results: ItemResult[], hit: (r: ItemResult) => boolean, of = results): Rate => ({
  hits: of.filter(hit).length,
  total: of.length,
});

// Nearest-rank percentile. Undefined for an empty list rather than NaN.
export function percentile(values: number[], p: number): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

export function summarizeStalls(results: ItemResult[]): StallSummary {
  const stalls = results.filter((r) => r.kind === 'stall');
  return {
    n: stalls.length,
    detected: rate(stalls, (r) => r.detected),
    top1: rate(stalls, (r) => r.top1),
    top3: rate(stalls, (r) => r.top3),
    abstain: rate(stalls, (r) => r.abstained),
    offered: rate(stalls, (r) => r.offered),
    falseOffer: rate(
      stalls,
      (r) => r.falseOffer,
      stalls.filter((r) => r.offered),
    ),
  };
}

// Fraction of fluent (not_stuck) items where the detector fired.
export function detectorFalseTriggerRate(results: ItemResult[]): Rate {
  const fluent = results.filter((r) => r.category === 'not_stuck');
  return rate(fluent, (r) => r.detected);
}

// Fraction of should-be-silent items where the app offered a word anyway.
export function falseTriggerRate(results: ItemResult[]): Rate {
  const silent = results.filter((r) => r.kind === 'silent');
  return rate(silent, (r) => r.offered);
}

export function latency(results: ItemResult[]): {
  p50: number | undefined;
  p95: number | undefined;
} {
  const ms = results.flatMap((r) => (r.latencyMs === undefined ? [] : [r.latencyMs]));
  return { p50: percentile(ms, 50), p95: percentile(ms, 95) };
}

export function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) groups.set(key(row), [...(groups.get(key(row)) ?? []), row]);
  return groups;
}
