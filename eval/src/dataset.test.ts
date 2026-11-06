import { describe, expect, it } from 'vitest';
import { normalizePhrase } from '../../server/src/gate/normalize.js';
import { loadItems, loadLongDocs, SILENT_CATEGORIES, type ItemSet } from './dataset.js';

const key = (s: string): string => normalizePhrase(s).join(' ');

describe.each<ItemSet>(['main', 'hard'])('%s item set', (set) => {
  it('has unique ids and a target among its acceptable words for every stall item', async () => {
    const items = await loadItems('all', set);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    for (const i of items) {
      if (SILENT_CATEGORIES.includes(i.category)) {
        expect(i.target, i.id).toBeNull();
        expect(i.acceptable, i.id).toEqual([]);
      } else {
        expect(i.target, i.id).not.toBeNull();
        expect(i.acceptable.map(key), i.id).toContain(key(i.target ?? ''));
      }
    }
  });

  it('splits into dev and holdout without overlap', async () => {
    const all = await loadItems('all', set);
    const dev = await loadItems('dev', set);
    const holdout = await loadItems('holdout', set);
    expect(dev.length + holdout.length).toBe(all.length);
    expect(holdout.length).toBeGreaterThan(0);
  });
});

describe('hard set', () => {
  it('is about 40 items with about a quarter held out', async () => {
    const all = await loadItems('all', 'hard');
    const holdout = await loadItems('holdout', 'hard');
    expect(all.length).toBeGreaterThanOrEqual(38);
    expect(holdout.length / all.length).toBeCloseTo(0.25, 1);
  });

  it('gives every technical item a multi-paragraph brief that contains its term', async () => {
    const tech = (await loadItems('all', 'hard')).filter((i) => i.category === 'technical');
    expect(tech.length).toBeGreaterThanOrEqual(8);
    for (const i of tech) {
      expect(i.brief?.split('\n\n').length, i.id).toBeGreaterThanOrEqual(2);
      const brief = i.brief?.toLowerCase() ?? '';
      expect(
        i.acceptable.some((a) => brief.includes(a.toLowerCase())),
        i.id,
      ).toBe(true);
    }
  });

  it('has items that cannot be known, which must get no offer', async () => {
    const items = await loadItems('all', 'hard');
    expect(
      items.filter((i) => i.category === 'not_stuck_unknowable').length,
    ).toBeGreaterThanOrEqual(5);
  });
});

describe('long documents', () => {
  it("hold every technical item's term, but only after the first 1500 characters", async () => {
    const docs = await loadLongDocs();
    const tech = (await loadItems('all', 'hard')).filter((i) => i.category === 'technical');
    for (const i of tech) {
      const doc = (i.doc ? docs[i.doc] : undefined)?.toLowerCase() ?? '';
      expect(doc.length, i.id).toBeGreaterThan(3000);
      const at = i.acceptable.map((a) => doc.indexOf(a.toLowerCase())).filter((n) => n >= 0);
      expect(at.length, i.id).toBeGreaterThan(0);
      expect(Math.min(...at), i.id).toBeGreaterThan(1500);
    }
  });
});
