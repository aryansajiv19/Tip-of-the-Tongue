import { execFileSync } from 'node:child_process';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { falseTriggerRate, summarizeStalls, type ItemResult } from './metrics.js';
import { summarize, type ScenarioScore } from './score.js';

// The standard suite, so every change is measured the same way. A thin wrapper: it runs the
// existing runners, reads the JSON they write, and reduces it with the existing summaries.
interface Suite {
  name: string;
  // npm script of the eval workspace and its arguments, given the guesser.
  script: string;
  args: (guesser: string) => string[];
  // The result file the runner writes (in eval-results/).
  file: (guesser: string) => string;
  // Flat numbers for the one-line summary.
  summary: (json: unknown) => Record<string, number>;
}

const fromScores = (scores: ScenarioScore[]): Record<string, number> => {
  const s = summarize(scores);
  return {
    stalls: s.stalls,
    correct: s.correct.hits,
    wrong: s.wrong,
    missed: s.missed,
    fluentPopups: s.fluent.hits,
    fluentLines: s.fluent.total,
    otherPopups: s.other.hits,
    otherLines: s.other.total,
    ...(s.silenceP50 === undefined ? {} : { silenceP50Ms: s.silenceP50 }),
  };
};

const fromItems = (results: ItemResult[]): Record<string, number> => {
  const s = summarizeStalls(results);
  const silent = falseTriggerRate(results);
  return {
    stalls: s.n,
    top1: s.top1.hits,
    top3: s.top3.hits,
    offered: s.offered.hits,
    falseOffers: s.falseOffer.hits,
    silentItems: silent.total,
    silentOffers: silent.hits,
  };
};

export const SUITES: Suite[] = [
  {
    name: 'dev-replay',
    script: 'scenarios',
    args: (g) => ['--split', 'dev', '--guesser', g, '--diarize'],
    file: (g) => `scenarios-${g}-dev-diarize.json`,
    summary: (j) =>
      fromScores((j as { runs: { score: ScenarioScore }[] }).runs.map((r) => r.score)),
  },
  {
    name: 'hard',
    script: 'eval',
    args: (g) => ['--set', 'hard', '--split', 'dev', '--guesser', g],
    file: (g) => `${g}-dev-hard.json`,
    summary: (j) => fromItems((j as { results: ItemResult[] }).results),
  },
  {
    name: 'specialist-match',
    script: 'eval',
    args: (g) => ['--set', 'specialist', '--split', 'dev', '--guesser', g, '--skills', 'match'],
    file: (g) => `${g}-dev-specialist-skills-match.json`,
    summary: (j) => fromItems((j as { results: ItemResult[] }).results),
  },
];

// Real speech through the app (macOS voices, real keys): only with --live.
export const LIVE: Suite = {
  name: 'live',
  script: 'scenarios:live',
  args: () => ['--split', 'dev'],
  file: () => 'live-scenarios-dev.json',
  summary: (j) => fromScores((j as { score: ScenarioScore }[]).map((r) => r.score)),
};

export interface BenchLine {
  at: string;
  commit: string;
  guesser: string;
  suite: string;
  metrics: Record<string, number>;
}

// Each metric against the previous run of the same suite and guesser; counts, so a change of
// one is one item.
export function compare(prev: BenchLine | undefined, now: BenchLine): string {
  const keys = Object.keys(now.metrics);
  const cell = (k: string) => {
    const v = now.metrics[k] as number;
    const p = prev?.metrics[k];
    return p === undefined || p === v ? `${k} ${v}` : `${k} ${v} (${v > p ? '+' : ''}${v - p})`;
  };
  const head = `${now.suite} [${now.guesser}] ${now.commit}${prev ? ` vs ${prev.commit}` : ' (first run)'}`;
  return `${head}: ${keys.map(cell).join(', ')}`;
}

export const lastOf = (lines: BenchLine[], suite: string, guesser: string): BenchLine | undefined =>
  lines.findLast((l) => l.suite === suite && l.guesser === guesser);

const parseLines = (text: string): BenchLine[] =>
  text
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as BenchLine);

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      guesser: { type: 'string', default: 'claude' },
      live: { type: 'boolean', default: false },
      only: { type: 'string' },
    },
  });
  const guesser = values.guesser;
  if (guesser !== 'mock' && guesser !== 'claude')
    throw new Error('--guesser must be mock or claude');
  const only = values.only?.split(',');
  const suites = [...SUITES, ...(values.live ? [LIVE] : [])].filter(
    (s) => !only || only.includes(s.name),
  );
  if (suites.length === 0) throw new Error('no suites match --only');

  const outDir = fileURLToPath(new URL('../../eval-results/', import.meta.url));
  const benchFile = `${outDir}bench.jsonl`;
  await mkdir(outDir, { recursive: true });
  const history = parseLines(await readFile(benchFile, 'utf8').catch(() => ''));
  const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD']).toString().trim();

  for (const suite of suites) {
    console.error(`bench: ${suite.name} ...`);
    execFileSync('npm', ['run', suite.script, '-w', 'eval', '--', ...suite.args(guesser)], {
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    const json: unknown = JSON.parse(await readFile(`${outDir}${suite.file(guesser)}`, 'utf8'));
    const line: BenchLine = {
      at: new Date().toISOString(),
      commit,
      guesser,
      suite: suite.name,
      metrics: suite.summary(json),
    };
    console.log(compare(lastOf(history, suite.name, guesser), line));
    await appendFile(benchFile, `${JSON.stringify(line)}\n`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
