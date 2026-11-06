import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { config } from '../../server/src/config.js';
import { detectStuck } from '../../server/src/stuck/detect.js';
import { decideOffer, normalizePhrase } from '../../server/src/gate/index.js';
import { createGuesser, loadProfile } from '../../server/src/guess/index.js';
import { dataPath, loadItems, SILENT_CATEGORIES, type Item } from './dataset.js';
import type { ItemResult } from './metrics.js';
import { sweep, toTimedWords } from './timeline.js';
import { renderMarkdown, type RunMeta } from './report.js';

const COOLDOWN_MS = 10_000;

const same = (a: string, b: string): boolean =>
  normalizePhrase(a).join(' ') === normalizePhrase(b).join(' ');

export async function runItem(
  item: Item,
  guess: ReturnType<typeof createGuesser>,
  profile: Awaited<ReturnType<typeof loadProfile>>,
): Promise<ItemResult> {
  const words = toTimedWords(item.utterance);
  const lastEndMs = words.at(-1)?.endMs ?? 0;
  const kind = SILENT_CATEGORIES.includes(item.category) ? 'silent' : 'stall';
  const isRight = (word: string): boolean => item.acceptable.some((a) => same(a, word));

  // Detected = the detector fired at least once. The guess uses the last trigger: the most context.
  const trigger = sweep(words, (heard, nowMs) =>
    detectStuck(heard, nowMs, { pauseMs: config.stuckPauseMs }),
  ).at(-1);
  if (!trigger) {
    return {
      id: item.id,
      category: item.category,
      kind,
      detected: false,
      detectAfterMs: undefined,
      top1: false,
      top3: false,
      abstained: false,
      offered: false,
      falseOffer: false,
      target: item.target,
      guessed: [],
      offeredWords: [],
      latencyMs: undefined,
    };
  }
  const { nowMs } = trigger;
  // Words heard after the stall marker may already be the answer, as in the live session.
  const saidSinceStuck = trigger.heard.filter((w) => w.startMs >= trigger.result.sinceMs);

  const result = await guess({
    conversation: item.context,
    stuckPhrase: trigger.result.contextWindow,
    ...(item.brief ? { brief: item.brief } : {}),
    profile,
  });
  const decision = decideOffer(
    result,
    { saidSinceStuck, nowMs, recentlyOffered: new Map() },
    { minConfidence: config.gateMinConfidence, cooldownMs: COOLDOWN_MS },
  );

  return {
    id: item.id,
    category: item.category,
    kind,
    detected: true,
    detectAfterMs: nowMs - lastEndMs,
    top1: kind === 'stall' && result.candidates.slice(0, 1).some((c) => isRight(c.word)),
    top3: kind === 'stall' && result.candidates.slice(0, 3).some((c) => isRight(c.word)),
    abstained: result.abstain,
    offered: decision.offer,
    falseOffer:
      decision.offer && (kind === 'silent' || !decision.candidates.some((c) => isRight(c.word))),
    target: item.target,
    guessed: result.candidates,
    offeredWords: decision.offer ? decision.candidates.map((c) => c.word) : [],
    latencyMs: result.latencyMs,
  };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      split: { type: 'string', default: 'all' },
      guesser: { type: 'string', default: 'mock' },
    },
  });
  const split = values.split;
  const kind = values.guesser;
  if (split !== 'dev' && split !== 'holdout' && split !== 'all')
    throw new Error(`--split must be dev, holdout or all`);
  if (kind !== 'mock' && kind !== 'claude') throw new Error(`--guesser must be mock or claude`);
  if (kind === 'claude' && !config.anthropicApiKey)
    throw new Error('--guesser claude needs ANTHROPIC_API_KEY');

  const guess = createGuesser({
    ...(kind === 'claude' && config.anthropicApiKey ? { apiKey: config.anthropicApiKey } : {}),
    model: config.anthropicModel,
    timeoutMs: config.guessTimeoutMs,
  });
  const profile = await loadProfile(dataPath('profiles/example.json'));
  const items = await loadItems(split);

  const results: ItemResult[] = [];
  for (const item of items) results.push(await runItem(item, guess, profile));

  const meta: RunMeta = {
    guesser: kind,
    split,
    ...(kind === 'claude' ? { model: config.anthropicModel } : {}),
  };
  const md = renderMarkdown(meta, results);
  const outDir = fileURLToPath(new URL('../../eval-results/', import.meta.url));
  await mkdir(outDir, { recursive: true });
  await writeFile(
    `${outDir}${kind}-${split}.json`,
    `${JSON.stringify({ meta, results }, null, 2)}\n`,
  );
  await writeFile(`${outDir}${kind}-${split}.md`, md);
  console.log(md);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
