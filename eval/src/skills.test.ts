import { describe, expect, it } from 'vitest';
import { loadPacks, skillsFor } from './skills.js';

describe('skillsFor', () => {
  it('gives the item its own pack, none, or a different pack', async () => {
    const packs = await loadPacks();
    expect([...packs.keys()].length).toBe(5);
    expect(skillsFor('off', 'medical', packs)).toEqual([]);
    expect(skillsFor('match', undefined, packs)).toEqual([]);
    const own = skillsFor('match', 'medical', packs);
    const other = skillsFor('wrong', 'medical', packs);
    expect(own).toHaveLength(1);
    expect(other).toHaveLength(1);
    expect(other[0]?.name).not.toBe(own[0]?.name);
    expect(own[0]?.terms).toContain('referral');
  });

  it('wraps round after the last pack', async () => {
    const packs = await loadPacks();
    const last = [...packs.keys()].at(-1) as string;
    expect(skillsFor('wrong', last, packs)[0]?.name).toBe([...packs.values()][0]?.name);
  });
});
