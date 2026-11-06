import { briefForGuesser } from '../../server/src/guess/glossary.js';
import type { Item } from './dataset.js';

export type BriefMode = 'full' | 'glossary' | 'head';

// Replaces the short brief of items that have a long document with what the guesser would get
// for that document: all of it, its glossary plus start, or only the start.
export function applyBriefMode(
  items: Item[],
  mode: BriefMode,
  docs: Record<string, string>,
  glossaries: Record<string, string | undefined>,
): Item[] {
  return items.map((item) => {
    const doc = item.doc ? docs[item.doc] : undefined;
    if (!item.doc || doc === undefined) return item;
    const brief =
      mode === 'full'
        ? doc
        : briefForGuesser(doc, mode === 'glossary' ? glossaries[item.doc] : undefined);
    return { ...item, brief };
  });
}
