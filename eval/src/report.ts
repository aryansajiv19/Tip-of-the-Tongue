import {
  falseTriggerRate,
  detectionTime,
  groupBy,
  latency,
  summarizeStalls,
  type ItemResult,
  type Rate,
  wilson,
} from './metrics.js';

export interface RunMeta {
  guesser: 'mock' | 'claude';
  split: 'dev' | 'holdout' | 'all';
  noContext?: boolean;
  sttNoise?: boolean;
  model?: string;
}

const fmtRate = ({ hits, total }: Rate): string =>
  total === 0 ? 'n/a' : `${Math.round((hits / total) * 100)}% (${hits}/${total})`;
// Rate with its 95% Wilson interval, e.g. "94% (30/32) [80-98%]".
const fmtRateCi = (r: Rate): string => {
  const ci = wilson(r);
  return ci
    ? `${fmtRate(r)} [${Math.round(ci.low * 100)}-${Math.round(ci.high * 100)}%]`
    : fmtRate(r);
};
const fmtMs = (ms: number | undefined): string =>
  ms === undefined ? 'n/a' : `${Math.round(ms)} ms`;

function noiseLine(results: ItemResult[]): string {
  const swapped = results.reduce((n, r) => n + (r.noise?.swapped ?? 0), 0);
  const eligible = results.reduce((n, r) => n + (r.noise?.eligible ?? 0), 0);
  return `Speech-to-text noise: um/uh/er dropped, lowercase, no punctuation, ${swapped} of ${eligible} non-target words (${eligible ? Math.round((swapped / eligible) * 100) : 0}%) swapped for a mishearing. Target words untouched, timing and pauses kept.`;
}

export function renderMarkdown(meta: RunMeta, results: ItemResult[]): string {
  const stalls = results.filter((r) => r.kind === 'stall');
  const silent = results.filter((r) => r.kind === 'silent');
  const stallRows = [...groupBy(stalls, (r) => r.category), ['All', stalls] as const].map(
    ([name, rs]) => {
      const s = summarizeStalls(rs);
      return `| ${name} | ${s.n} | ${fmtRate(s.detected)} | ${fmtRateCi(s.top1)} | ${fmtRate(s.top3)} | ${fmtRate(s.abstain)} | ${fmtRate(s.offered)} | ${fmtRateCi(s.falseOffer)} |`;
    },
  );
  const silentRows = [...groupBy(silent, (r) => r.category)].map(
    ([name, rs]) =>
      `| ${name} | ${rs.length} | ${fmtRate({ hits: rs.filter((x) => x.detected).length, total: rs.length })} | ${fmtRate(falseTriggerRate(rs))} |`,
  );
  const lat = latency(results);
  const det = detectionTime(results);

  return [
    `# Evaluation: ${meta.guesser} guesser${meta.model ? ` (${meta.model})` : ''}, split ${meta.split}${meta.noContext ? ', no brief or profile' : ''}${meta.sttNoise ? ', simulated speech-to-text noise' : ''}`,
    '',
    '## Items where the user is stuck',
    '',
    '| Category | n | Detected | Top-1 | Top-3 | Abstain | Offered | False offers (of offers) |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...stallRows,
    '',
    '## Items where the app should stay silent',
    '',
    'The detector firing is expected on self_recovered (the user did stall first) and on not_stuck_pause (a thinking pause), and is a false trigger on not_stuck. An offer is wrong on all three.',
    '',
    '| Category | n | Detector fired | Offered anyway |',
    '| --- | --- | --- | --- |',
    ...silentRows,
    '',
    `Guess latency: p50 ${fmtMs(lat.p50)}, p95 ${fmtMs(lat.p95)}. Last detection vs end of last word: median ${fmtMs(det.p50)} (negative = before the user finished).`,
    '',
    ...(meta.sttNoise ? [noiseLine(results), ''] : []),
    'Intervals in brackets are 95% Wilson intervals; with this few items they are wide.',
    '',
    'Scripted written examples read as text, not speech. Not tested with people with aphasia.',
    '',
  ].join('\n');
}
