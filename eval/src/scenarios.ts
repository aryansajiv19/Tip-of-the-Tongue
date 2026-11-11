import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { dataPath } from './dataset.js';

const LineSchema = z.object({
  s: z.enum(['me', 'other']),
  // Which other person speaks (1 to 3, default 1), for conversations with more than two people.
  who: z.number().int().min(1).max(3).optional(),
  t: z.string().min(1),
  // The word the user is reaching for on this line, and the words that count as right.
  w: z.string().optional(),
  a: z.array(z.string()).optional(),
  // The user finds the word themselves later in the same line: nothing should be offered.
  recover: z.boolean().optional(),
  // Silence after the line, ms. Default: short between turns, longer after a stall.
  gap: z.number().optional(),
});
export type Line = z.infer<typeof LineSchema>;

const ScenarioSchema = z.object({
  id: z.string(),
  type: z.string(),
  split: z.enum(['dev', 'holdout']),
  title: z.string(),
  brief: z.string().optional(),
  profile: z.boolean().optional(),
  // Time between word starts, and the silence for each "...", for this conversation.
  wordMs: z.number().optional(),
  stallMs: z.number().optional(),
  // The silence for each single "…" in a line: a breath or slow speech, not a search.
  breathMs: z.number().optional(),
  // The user presses Start when the call begins, so the others' first lines are heard.
  othersFirst: z.boolean().optional(),
  // Settings the user chose in the page, for example a shorter pause.
  settings: z.object({ pauseMs: z.number().optional() }).optional(),
  lines: z.array(LineSchema).min(1),
});
export type Scenario = z.infer<typeof ScenarioSchema>;

const FileSchema = z.object({ scenarios: z.array(ScenarioSchema) });

export async function loadScenarios(split: 'dev' | 'holdout' | 'all'): Promise<Scenario[]> {
  const { scenarios } = FileSchema.parse(
    JSON.parse(await readFile(dataPath('eval/scenarios.json'), 'utf8')),
  );
  return split === 'all' ? scenarios : scenarios.filter((s) => s.split === split);
}
