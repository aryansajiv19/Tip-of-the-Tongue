import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadProfile, ProfileSchema } from './profile.js';

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
