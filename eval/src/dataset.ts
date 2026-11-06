import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const ItemSchema = z.object({
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
});
export type Item = z.infer<typeof ItemSchema>;

const FileSchema = z.object({ items: z.array(ItemSchema) });

export const SILENT_CATEGORIES: readonly string[] = ['not_stuck', 'self_recovered'];

export const dataPath = (rel: string): string =>
  fileURLToPath(new URL(`../../data/${rel}`, import.meta.url));

export async function loadItems(split: 'dev' | 'holdout' | 'all'): Promise<Item[]> {
  const { items } = FileSchema.parse(
    JSON.parse(await readFile(dataPath('eval/circumlocutions.json'), 'utf8')),
  );
  return split === 'all' ? items : items.filter((i) => i.split === split);
}
