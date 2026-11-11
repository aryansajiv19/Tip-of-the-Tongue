import { readdir, readFile } from 'node:fs/promises';
import { dataPath } from './dataset.js';
import type { Skill } from '../../server/src/events.js';

export type SkillsMode = 'match' | 'off' | 'wrong';
export const SKILLS_MODES: readonly SkillsMode[] = ['match', 'off', 'wrong'];

// The built-in packs, by id, in a fixed order.
export async function loadPacks(): Promise<Map<string, Skill>> {
  const dir = dataPath('skills');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  const packs = new Map<string, Skill>();
  for (const f of files) {
    const p = JSON.parse(await readFile(`${dir}/${f}`, 'utf8')) as Skill & { id: string };
    packs.set(p.id, { name: p.name, description: p.description, terms: p.terms });
  }
  return packs;
}

// The skills to switch on for an item whose words belong to `pack`: its own pack (match), none
// (off), or the next pack along, which is about something else (wrong).
export function skillsFor(
  mode: SkillsMode,
  pack: string | undefined,
  packs: Map<string, Skill>,
): Skill[] {
  if (mode === 'off' || pack === undefined) return [];
  const ids = [...packs.keys()];
  const own = ids.indexOf(pack);
  const id = mode === 'match' ? pack : ids[(own + 1) % ids.length];
  const skill = id === undefined ? undefined : packs.get(id);
  return skill ? [skill] : [];
}
