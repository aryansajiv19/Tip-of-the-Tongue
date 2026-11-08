import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const ItemSchema = z.object({
  id: z.string(),
  context: z.string(),
  brief: z.string().optional(),
  utterance: z.string(),
  target: z.string().nullable(),
  acceptable: z.array(z.string()),
  category: z.string(),
  split: z.enum(['dev', 'holdout']),
  // Fluent speech with a thinking pause in it. The detector fires on these by design, so what
  // is measured is whether anything gets offered.
  pause: z.boolean().optional(),
  // Key into data/eval/long-docs.json: a long document that contains this item's brief terms.
  doc: z.string().optional(),
});
export type Item = z.infer<typeof ItemSchema>;

const FileSchema = z.object({ items: z.array(ItemSchema) });

export const SILENT_CATEGORIES: readonly string[] = [
  'not_stuck',
  'self_recovered',
  // Nothing in the text says what the word is, so any offer is wrong.
  'not_stuck_unknowable',
];

export const dataPath = (rel: string): string =>
  fileURLToPath(new URL(`../../data/${rel}`, import.meta.url));

export type ItemSet = 'main' | 'hard';
const SET_FILES: Record<ItemSet, string> = {
  main: 'eval/circumlocutions.json',
  hard: 'eval/hard.json',
};

export async function loadItems(
  split: 'dev' | 'holdout' | 'all',
  set: ItemSet = 'main',
): Promise<Item[]> {
  const { items } = FileSchema.parse(JSON.parse(await readFile(dataPath(SET_FILES[set]), 'utf8')));
  return split === 'all' ? items : items.filter((i) => i.split === split);
}

const DocsSchema = z.object({ docs: z.record(z.string(), z.string()) });

export async function loadLongDocs(): Promise<Record<string, string>> {
  return DocsSchema.parse(JSON.parse(await readFile(dataPath('eval/long-docs.json'), 'utf8'))).docs;
}
