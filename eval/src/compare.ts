import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { groupBy, summarizeStalls, type ItemResult, type Rate } from './metrics.js';

const fmt = ({ hits, total }: Rate): string =>
  total === 0 ? 'n/a' : `${Math.round((hits / total) * 100)}% (${hits}/${total})`;

// Side-by-side table of two runs of the same items: detector hit rate, top-1 and false offers,
// per category and overall. A is the reference (clean), B the variant (no context, or noisy).
export function compareRuns(
  a: { label: string; results: ItemResult[] },
  b: { label: string; results: ItemResult[] },
): string {
  const stallsA = a.results.filter((r) => r.kind === 'stall');
  const stallsB = b.results.filter((r) => r.kind === 'stall');
  const groupsB = groupBy(stallsB, (r) => r.category);
  const rows = [...groupBy(stallsA, (r) => r.category), ['All', stallsA] as const].map(
    ([name, rs]) => {
      const sa = summarizeStalls(rs);
      const sb = summarizeStalls(name === 'All' ? stallsB : (groupsB.get(name) ?? []));
      return `| ${name} | ${sa.n} | ${fmt(sa.detected)} | ${fmt(sb.detected)} | ${fmt(sa.top1)} | ${fmt(sb.top1)} | ${fmt(sa.falseOffer)} | ${fmt(sb.falseOffer)} |`;
    },
  );
  return [
    `| Category | n | Detected: ${a.label} | ${b.label} | Top-1: ${a.label} | ${b.label} | False offers: ${a.label} | ${b.label} |`,
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

async function load(path: string): Promise<ItemResult[]> {
  return (JSON.parse(await readFile(path, 'utf8')) as { results: ItemResult[] }).results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [pathA, labelA, pathB, labelB] = process.argv.slice(2);
  if (!pathA || !labelA || !pathB || !labelB)
    throw new Error('usage: compare <a.json> <label a> <b.json> <label b>');
  console.log(
    compareRuns(
      { label: labelA, results: await load(pathA) },
      { label: labelB, results: await load(pathB) },
    ),
  );
}
