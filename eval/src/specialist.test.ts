import { describe, expect, it } from 'vitest';
import { loadItems } from './dataset.js';

describe('specialist set', () => {
  it('has 12 items per pack, with a holdout share and silent items', async () => {
    const items = await loadItems('all', 'specialist');
    const packs = new Map<string, typeof items>();
    for (const i of items) packs.set(i.pack ?? '', [...(packs.get(i.pack ?? '') ?? []), i]);
    expect([...packs.keys()].sort()).toEqual([
      'everyday',
      'finance',
      'interview',
      'medical',
      'tech',
    ]);
    for (const [, rows] of packs) {
      expect(rows).toHaveLength(12);
      expect(rows.filter((r) => r.split === 'holdout').length).toBeGreaterThanOrEqual(3);
      expect(rows.filter((r) => r.target === null)).toHaveLength(1);
      for (const r of rows.filter((x) => x.target !== null)) {
        expect(r.acceptable).toContain(r.target);
        expect(r.utterance).toContain('...');
      }
    }
  });
});
