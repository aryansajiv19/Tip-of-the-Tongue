import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { config } from '../../server/src/config.js';
import { createGuesser } from '../../server/src/guess/guesser.js';
import { loadProfile } from '../../server/src/guess/profile.js';
import { dataPath } from './dataset.js';
import { layoutScenario } from './layout.js';
import { replay } from './replay.js';
import { scoreScenario } from './score.js';
import { renderScenarioReport, type ScenarioRun } from './scenarioReport.js';
import { loadScenarios } from './scenarios.js';

const CONCURRENCY = 4;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      split: { type: 'string', default: 'dev' },
      guesser: { type: 'string', default: 'mock' },
      model: { type: 'string' },
    },
  });
  const split = values.split;
  const kind = values.guesser;
  if (split !== 'dev' && split !== 'holdout' && split !== 'all')
    throw new Error('--split must be dev, holdout or all');
  if (kind !== 'mock' && kind !== 'claude') throw new Error('--guesser must be mock or claude');
  if (kind === 'claude' && !config.anthropicApiKey)
    throw new Error('--guesser claude needs ANTHROPIC_API_KEY');
  const model = values.model ?? config.anthropicModel;

  const guess = createGuesser({
    ...(kind === 'claude' && config.anthropicApiKey ? { apiKey: config.anthropicApiKey } : {}),
    model,
    timeoutMs: config.guessTimeoutMs,
  });
  const profile = await loadProfile(dataPath('profiles/example.json'));
  const scenarios = await loadScenarios(split);

  const runs: ScenarioRun[] = [];
  const queue = [...scenarios];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let sc = queue.shift(); sc; sc = queue.shift()) {
        const placed = layoutScenario(sc);
        const result = await replay(sc, placed, guess, sc.profile ? profile : undefined);
        runs.push({
          score: scoreScenario(sc.id, sc.type, placed, result.offers),
          placed,
          offers: result.offers,
          guessCalls: result.guessCalls,
        });
      }
    }),
  );
  runs.sort((a, b) => a.score.id.localeCompare(b.score.id));

  const meta = { guesser: kind, split, ...(kind === 'claude' ? { model } : {}) };
  const md = renderScenarioReport(meta, runs);
  const outDir = fileURLToPath(new URL('../../eval-results/', import.meta.url));
  await mkdir(outDir, { recursive: true });
  const tag = `scenarios-${kind}-${split}${values.model ? `-${values.model}` : ''}`;
  await writeFile(
    `${outDir}${tag}.json`,
    `${JSON.stringify({ meta, runs: runs.map((r) => ({ score: r.score, offers: r.offers })) }, null, 2)}\n`,
  );
  await writeFile(`${outDir}${tag}.md`, md);
  console.log(md);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
