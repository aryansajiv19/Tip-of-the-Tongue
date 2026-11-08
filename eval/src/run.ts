import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { config } from '../../server/src/config.js';
import { detectStuck } from '../../server/src/stuck/detect.js';
import { decideOffer } from '../../server/src/gate/gate.js';
import { normalizePhrase } from '../../server/src/gate/normalize.js';
import { createGlossaryBuilder } from '../../server/src/guess/glossary.js';
import { createGuesser } from '../../server/src/guess/guesser.js';
import { loadProfile } from '../../server/src/guess/profile.js';
import { applyBriefMode, type BriefMode } from './briefmode.js';
import { dataPath, loadItems, loadLongDocs, SILENT_CATEGORIES, type Item } from './dataset.js';
import type { ItemResult } from './metrics.js';
import { degradeWords, hashSeed } from './noise.js';
import { sweep, toTimedWords } from './timeline.js';
import { renderMarkdown, type RunMeta } from './report.js';

// Fixed so the noisy run is repeatable.
const NOISE_SEED = 1;

export interface RunOptions {
  // Pass the meeting brief and the profile to the guesser. Off for the no-context ablation.
  context: boolean;
  // Simulate Chrome's Web Speech on the transcript.
  sttNoise: boolean;
}

const same = (a: string, b: string): boolean =>
  normalizePhrase(a).join(' ') === normalizePhrase(b).join(' ');

export async function runItem(
  item: Item,
  guess: ReturnType<typeof createGuesser>,
  profile: Awaited<ReturnType<typeof loadProfile>>,
  opts: RunOptions = { context: true, sttNoise: false },
): Promise<ItemResult> {
  const timed = toTimedWords(item.utterance);
  const degraded = opts.sttNoise
    ? degradeWords(
        timed,
        [...(item.target ? [item.target] : []), ...item.acceptable],
        hashSeed(NOISE_SEED, item.id),
      )
    : undefined;
  const words = degraded?.words ?? timed;
  const noise = degraded && { swapped: degraded.swapped, eligible: degraded.eligible };
  const lastEndMs = words.at(-1)?.endMs ?? 0;
  // Reported apart from other fluent speech: the detector firing on these is expected.
  const category = item.pause ? 'not_stuck_pause' : item.category;
  const kind = SILENT_CATEGORIES.includes(item.category) ? 'silent' : 'stall';
  const isRight = (word: string): boolean => item.acceptable.some((a) => same(a, word));

  // Detected = the detector fired at least once. The guess uses the last trigger: the most context.
  const trigger = sweep(words, (heard, nowMs) =>
    detectStuck(heard, nowMs, { pauseMs: config.stuckPauseMs }),
  ).at(-1);
  if (!trigger) {
    return {
      id: item.id,
      category,
      kind,
      detected: false,
      detectAfterMs: undefined,
      noise,
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
    ...(opts.context && item.brief ? { brief: item.brief } : {}),
    ...(opts.context ? { profile } : {}),
  });
  const decision = decideOffer(
    result,
    { saidSinceStuck, nowMs, recentlyOffered: new Map() },
    { minConfidence: config.gateMinConfidence, cooldownMs: config.cooldownMs },
  );

  return {
    id: item.id,
    category,
    kind,
    detected: true,
    detectAfterMs: nowMs - lastEndMs,
    noise,
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
      set: { type: 'string', default: 'main' },
      'brief-mode': { type: 'string' },
      model: { type: 'string' },
      'no-context': { type: 'boolean', default: false },
      'stt-noise': { type: 'boolean', default: false },
    },
  });
  const split = values.split;
  const kind = values.guesser;
  if (split !== 'dev' && split !== 'holdout' && split !== 'all')
    throw new Error(`--split must be dev, holdout or all`);
  const set = values.set;
  if (set !== 'main' && set !== 'hard') throw new Error(`--set must be main or hard`);
  const model = values.model ?? config.anthropicModel;
  const briefMode = values['brief-mode'];
  if (briefMode !== undefined && !['full', 'glossary', 'head'].includes(briefMode))
    throw new Error('--brief-mode must be full, glossary or head');
  if (briefMode === 'glossary' && kind !== 'claude')
    throw new Error(
      '--brief-mode glossary needs --guesser claude (it builds the glossary with Claude)',
    );
  if (kind !== 'mock' && kind !== 'claude') throw new Error(`--guesser must be mock or claude`);
  if (kind === 'claude' && !config.anthropicApiKey)
    throw new Error('--guesser claude needs ANTHROPIC_API_KEY');

  const guess = createGuesser({
    ...(kind === 'claude' && config.anthropicApiKey ? { apiKey: config.anthropicApiKey } : {}),
    model,
    timeoutMs: config.guessTimeoutMs,
  });
  const profile = await loadProfile(dataPath('profiles/example.json'));
  let items = await loadItems(split, set);
  if (briefMode) {
    const docs = await loadLongDocs();
    const glossaries: Record<string, string | undefined> = {};
    if (briefMode === 'glossary') {
      const build = createGlossaryBuilder({
        ...(config.anthropicApiKey ? { apiKey: config.anthropicApiKey } : {}),
        model,
        timeoutMs: 20_000,
      });
      for (const key of new Set(items.flatMap((i) => (i.doc ? [i.doc] : [])))) {
        glossaries[key] = await build(docs[key] ?? '');
        console.log(`glossary for ${key}: ${glossaries[key] ?? 'none (call failed)'}`);
      }
    }
    items = applyBriefMode(items, briefMode as BriefMode, docs, glossaries);
  }

  const results: ItemResult[] = [];
  const opts: RunOptions = { context: !values['no-context'], sttNoise: values['stt-noise'] };
  for (const item of items) results.push(await runItem(item, guess, profile, opts));
  const tag = `${set === 'hard' ? '-hard' : ''}${briefMode ? `-brief-${briefMode}` : ''}${values.model ? `-${values.model}` : ''}${opts.context ? '' : '-nocontext'}${opts.sttNoise ? '-noise' : ''}`;

  const meta: RunMeta = {
    guesser: kind,
    split,
    noContext: !opts.context,
    sttNoise: opts.sttNoise,
    set,
    ...(briefMode ? { briefMode } : {}),
    ...(kind === 'claude' ? { model } : {}),
  };
  const md = renderMarkdown(meta, results);
  const outDir = fileURLToPath(new URL('../../eval-results/', import.meta.url));
  await mkdir(outDir, { recursive: true });
  await writeFile(
    `${outDir}${kind}-${split}${tag}.json`,
    `${JSON.stringify({ meta, results }, null, 2)}\n`,
  );
  await writeFile(`${outDir}${kind}-${split}${tag}.md`, md);
  console.log(md);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
