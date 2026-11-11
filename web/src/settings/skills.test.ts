import { describe, expect, it } from 'vitest';
import type { Pack } from '../skills/packs';
import { MAX_ACTIVE, MAX_CUSTOM_TERMS, createSkills, emptySkills, skillsEvent } from './skills';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => void (data[k] = v),
    removeItem: (k: string) => void Reflect.deleteProperty(data, k),
  };
}
const pack = (id: string): Pack => ({
  id,
  name: `Pack ${id}`,
  description: 'shown in settings',
  hint: `hint ${id}`,
  terms: [`${id}-a`, `${id}-b`],
});
const PACKS = [pack('a'), pack('b'), pack('c')];
const custom = (name: string, terms = '') => ({ name, description: '', terms });

describe('skillsEvent', () => {
  it('sends an active pack as name, hint and terms, then the user’s own', () => {
    const s = {
      packs: ['b'],
      custom: [
        { id: '1', name: ' Boat  club ', description: ' d ', terms: 'jib, genoa\nkeel, JIB' },
      ],
    };
    expect(skillsEvent(s, PACKS)).toEqual({
      type: 'session.skills',
      skills: [
        { name: 'Pack b', description: 'hint b', terms: ['b-a', 'b-b'] },
        { name: 'Boat club', description: 'd', terms: ['jib', 'genoa', 'keel'] },
      ],
    });
  });

  it('leaves the description out when empty, skips a nameless skill, caps terms at 60', () => {
    const many = Array.from({ length: 90 }, (_, i) => `t${i}`).join(',');
    const s = {
      packs: [],
      custom: [
        { id: '1', name: 'Many', description: '', terms: many },
        { id: '2', name: '  ', description: '', terms: 'x' },
      ],
    };
    const { skills } = skillsEvent(s, PACKS) as {
      skills: { name: string; description?: string; terms: string[] }[];
    };
    expect(skills).toHaveLength(1);
    expect(skills[0]).not.toHaveProperty('description');
    expect(skills[0]?.terms).toHaveLength(MAX_CUSTOM_TERMS);
  });

  it('sends an empty list when nothing is on, which turns skills off', () => {
    expect(skillsEvent(emptySkills, PACKS)).toEqual({ type: 'session.skills', skills: [] });
  });

  it('ignores a stored pack id that no longer exists', () => {
    expect(skillsEvent({ packs: ['gone'], custom: [] }, PACKS)).toEqual({
      type: 'session.skills',
      skills: [],
    });
  });
});

describe('the store', () => {
  it('turns packs on and off and saves each change', () => {
    const storage = fakeStorage();
    const store = createSkills(storage);
    store.setPack('a', true);
    store.setPack('a', true);
    expect(store.snapshot().packs).toEqual(['a']);
    expect(JSON.parse(storage.data['tott.skills'] ?? 'null')).toEqual({ packs: ['a'], custom: [] });
    store.setPack('a', false);
    expect(storage.data).toEqual({});
  });

  it('keeps at most 5 skills on, packs and the user’s own together', () => {
    const store = createSkills(fakeStorage());
    store.setPack('a', true);
    store.setPack('b', true);
    for (const n of ['1', '2', '3', '4']) store.saveCustom(custom(n));
    expect(store.snapshot().custom).toHaveLength(MAX_ACTIVE - 2);
    store.setPack('c', true);
    expect(store.snapshot().packs).toEqual(['a', 'b']);
  });

  it('edits a skill in place, even when full, and removes one', () => {
    const store = createSkills(fakeStorage());
    for (const n of ['1', '2', '3', '4', '5']) store.saveCustom(custom(n));
    const first = store.snapshot().custom[0];
    if (!first) throw new Error('no skill');
    store.saveCustom({ ...custom('renamed', 'x'), id: first.id });
    expect(store.snapshot().custom.map((c) => c.name)).toEqual(['renamed', '2', '3', '4', '5']);
    store.removeCustom(first.id);
    expect(store.snapshot().custom).toHaveLength(4);
  });

  it('refuses a skill with no name', () => {
    const store = createSkills(fakeStorage());
    store.saveCustom(custom('   '));
    expect(store.snapshot()).toBe(emptySkills);
  });

  it('loads what was saved, drops bad entries, and never exceeds 5', () => {
    const saved = JSON.stringify({
      packs: ['a', 7, 'b'],
      custom: [
        { id: 'x', name: 'Ok', description: 1, terms: 'a' },
        { id: 'y', name: '' },
        null,
        ...['1', '2', '3', '4'].map((n) => ({ id: n, name: n, terms: '' })),
      ],
    });
    const state = createSkills(fakeStorage({ 'tott.skills': saved })).snapshot();
    expect(state.packs).toEqual(['a', 'b']);
    expect(state.custom.map((c) => c.name)).toEqual(['Ok', '1', '2']);
    expect(state.custom[0]?.description).toBe('');
  });

  it('survives broken storage', () => {
    expect(createSkills(fakeStorage({ 'tott.skills': '{nope' })).snapshot()).toBe(emptySkills);
    expect(createSkills(null).snapshot()).toBe(emptySkills);
  });

  it('forgetAll clears both', () => {
    const store = createSkills(fakeStorage());
    store.setPack('a', true);
    store.saveCustom(custom('x'));
    store.forgetAll();
    expect(store.snapshot()).toBe(emptySkills);
  });
});
