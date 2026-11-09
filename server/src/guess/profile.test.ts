import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadProfile, mergeProfiles, ProfileSchema, profileForPrompt } from './profile.js';

describe('profile', () => {
  it('loads the example profile', async () => {
    const path = fileURLToPath(new URL('../../../data/profiles/example.json', import.meta.url));
    const p = await loadProfile(path);
    expect(p.pets.dog).toBe('Biscuit');
    expect(p.frequentlyLostWords).toContain('pharmacy');
  });

  it('fills defaults for an empty profile', () => {
    expect(ProfileSchema.parse({}).hobbies).toEqual([]);
  });

  it('rejects the wrong shape', () => {
    expect(ProfileSchema.safeParse({ hobbies: 'snooker' }).success).toBe(false);
  });
});

describe('profileForPrompt', () => {
  it('says what each word is', async () => {
    const path = fileURLToPath(new URL('../../../data/profiles/example.json', import.meta.url));
    const text = profileForPrompt(await loadProfile(path));
    expect(text).toContain('daughter Priya');
    expect(text).toContain('dog Biscuit');
    expect(text).toContain('local shop Corner Mart');
    expect(text).toContain('park Victoria Park');
    expect(text).toContain('hobbies gardening, snooker');
    expect(text).toContain('often forgets pharmacy, remote, kettle');
  });
  it('is empty for an empty profile', () => {
    expect(profileForPrompt(ProfileSchema.parse({}))).toBe('');
  });
});

describe('mergeProfiles', () => {
  const file = ProfileSchema.parse({
    name: 'Alex',
    pets: { dog: 'Biscuit' },
    frequentlyLostWords: ['kettle', 'remote'],
  });

  it('is nothing when there is nothing', () => {
    expect(mergeProfiles(undefined, undefined)).toBeUndefined();
    expect(mergeProfiles(undefined, { words: [], remembered: [] })).toBeUndefined();
    expect(mergeProfiles(undefined, { name: '  ', words: [], remembered: [] })).toBeUndefined();
  });

  it('is the file profile when the page sent nothing', () => {
    expect(mergeProfiles(file, undefined)).toEqual(file);
    expect(mergeProfiles(file, { words: [], remembered: [] })).toEqual(file);
  });

  it('is the page profile alone when there is no file', () => {
    const p = mergeProfiles(undefined, {
      role: 'nurse',
      words: ['heparin'],
      remembered: ['Okafor'],
    });
    expect(p?.role).toBe('nurse');
    expect(p?.frequentlyLostWords).toEqual(['heparin', 'Okafor']);
    expect(p?.pets).toEqual({});
  });

  it('adds the page words after the file words, then the remembered ones', () => {
    const p = mergeProfiles(file, { words: ['Northwind'], remembered: ['SOC 2'] });
    expect(p?.frequentlyLostWords).toEqual(['kettle', 'remote', 'Northwind', 'SOC 2']);
    expect(p?.pets).toEqual({ dog: 'Biscuit' });
  });

  it('lets the page name and role win, but keeps the file name when the page has none', () => {
    expect(mergeProfiles(file, { name: ' Dana ', words: [], remembered: [] })?.name).toBe('Dana');
    expect(mergeProfiles(file, { name: '', words: [], remembered: [] })?.name).toBe('Alex');
  });

  it('drops repeats whatever their case, keeping the first', () => {
    const p = mergeProfiles(file, { words: ['Kettle', 'ARR'], remembered: ['arr', 'REMOTE'] });
    expect(p?.frequentlyLostWords).toEqual(['kettle', 'remote', 'ARR']);
  });

  it('does not change the file profile it was given', () => {
    mergeProfiles(file, { words: ['Northwind'], remembered: [] });
    expect(file.frequentlyLostWords).toEqual(['kettle', 'remote']);
  });
});

describe('profileForPrompt with a name and role', () => {
  it('says who the user is', () => {
    const text = profileForPrompt(ProfileSchema.parse({ name: 'Dana', role: 'product lead' }));
    expect(text).toBe('user Dana; role product lead');
  });
});
