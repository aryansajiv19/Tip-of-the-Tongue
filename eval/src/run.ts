import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { config } from '../../server/src/config.js';
import type { Word } from '../../server/src/events.js';
import { detectStuck } from '../../server/src/stuck/detect.js';
import { decideOffer, normalizePhrase } from '../../server/src/gate/index.js';
import { createGuesser, loadProfile } from '../../server/src/guess/index.js';
import { dataPath, loadItems, SILENT_CATEGORIES, type Item } from './dataset.js';
import type { ItemResult } from './metrics.js';
import { renderMarkdown, type RunMeta } from './report.js';

const WORD_MS = 300;
const WORD_LEN_MS = 100;
// How long after the last word the item is scored.
const SCORE_AFTER_MS = 2000;
const COOLDOWN_MS = 10_000;

// Synthetic timing, as in the server tests: one word every 300 ms, each 100 ms long, then silence.
function toWords(utterance: string): Word[] {
  return utterance
    .split(/\s+/)
    .filter(Boolean)
    .map((text, i) => ({ text, startMs: i * WORD_MS, endMs: i * WORD_MS + WORD_LEN_MS }));
}

const same = (a: string, b: string): boolean =>
  normalizePhrase(a).join(' ') === normalizePhrase(b).join(' ');

export async function runItem(
  item: Item,
  guess: ReturnType<typeof createGuesser>,
  profile: Awaited<ReturnType<typeof loadProfile>>,
): Promise<ItemResult> {
  const words = toWords(item.utterance);
  // Words after the first "..." are what the user said once they had stalled.
  const stallAt = words.findIndex((w) => w.text.includes('...'));
  const saidSinceStuck = stallAt === -1 ? [] : words.slice(stallAt + 1);
  const nowMs = (words.at(-1)?.endMs ?? 0) + SCORE_AFTER_MS;

  const kind = SILENT_CATEGORIES.includes(item.category) ? 'silent' : 'stall';
  const isRight = (word: string): boolean => item.acceptable.some((a) => same(a, word));

  const stuck = detectStuck(words, nowMs, { pauseMs: config.stuckPauseMs });
  if (!stuck.stuck) {
    return {
      id: item.id,
      category: item.category,
      kind,
      detected: false,
      top1: false,
      top3: false,
      abstained: false,
      offered: false,
      falseOffer: false,
      latencyMs: undefined,
    };
  }

  const result = await guess({
    conversation: item.context,
    stuckPhrase: stuck.contextWindow,
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
    top1: kind === 'stall' && result.candidates.slice(0, 1).some((c) => isRight(c.word)),
    top3: kind === 'stall' && result.candidates.slice(0, 3).some((c) => isRight(c.word)),
    abstained: result.abstain,
    offered: decision.offer,
    falseOffer:
      decision.offer && (kind === 'silent' || !decision.candidates.some((c) => isRight(c.word))),
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
