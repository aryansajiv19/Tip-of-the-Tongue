import {
  falseTriggerRate,
  detectionTime,
  groupBy,
  latency,
  summarizeStalls,
  type ItemResult,
  type Rate,
} from './metrics.js';

export interface RunMeta {
  guesser: 'mock' | 'claude';
  split: 'dev' | 'holdout' | 'all';
  model?: string;
}

const fmtRate = ({ hits, total }: Rate): string =>
  total === 0 ? 'n/a' : `${Math.round((hits / total) * 100)}% (${hits}/${total})`;
const fmtMs = (ms: number | undefined): string =>
  ms === undefined ? 'n/a' : `${Math.round(ms)} ms`;

export function renderMarkdown(meta: RunMeta, results: ItemResult[]): string {
  const stalls = results.filter((r) => r.kind === 'stall');
  const silent = results.filter((r) => r.kind === 'silent');
  const stallRows = [...groupBy(stalls, (r) => r.category), ['All', stalls] as const].map(
    ([name, rs]) => {
      const s = summarizeStalls(rs);
      return `| ${name} | ${s.n} | ${fmtRate(s.detected)} | ${fmtRate(s.top1)} | ${fmtRate(s.top3)} | ${fmtRate(s.abstain)} | ${fmtRate(s.offered)} | ${fmtRate(s.falseOffer)} |`;
    },
  );
  const silentRows = [...groupBy(silent, (r) => r.category)].map(
    ([name, rs]) =>
      `| ${name} | ${rs.length} | ${fmtRate({ hits: rs.filter((x) => x.detected).length, total: rs.length })} | ${fmtRate(falseTriggerRate(rs))} |`,
  );
  const lat = latency(results);
  const det = detectionTime(results);

  return [
    `# Evaluation: ${meta.guesser} guesser${meta.model ? ` (${meta.model})` : ''}, split ${meta.split}`,
    '',
    '## Items where the user is stuck',
    '',
    '| Category | n | Detected | Top-1 | Top-3 | Abstain | Offered | False offers (of offers) |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...stallRows,
    '',
    '## Items where the app should stay silent',
    '',
    'The detector firing is expected on self_recovered (the user did stall first) and is a false trigger on not_stuck. An offer is wrong on both.',
    '',
    '| Category | n | Detector fired | Offered anyway |',
    '| --- | --- | --- | --- |',
    ...silentRows,
    '',
    `Guess latency: p50 ${fmtMs(lat.p50)}, p95 ${fmtMs(lat.p95)}. Last detection vs end of last word: median ${fmtMs(det.p50)} (negative = before the user finished).`,
    '',
    'Scripted written examples read as text, not speech. Not tested with people with aphasia.',
    '',
  ].join('\n');
}
