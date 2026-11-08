import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadProfile, ProfileSchema, profileForPrompt } from './profile.js';

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
