import { readFile } from 'node:fs/promises';
import { z } from 'zod';

// Personal words the guesser may use. Matches data/profiles/example.json; every field is optional.
export const ProfileSchema = z.object({
  note: z.string().optional(),
  name: z.string().optional(),
  role: z.string().optional(),
  people: z.record(z.string(), z.string()).default({}),
  pets: z.record(z.string(), z.string()).default({}),
  places: z.record(z.string(), z.string()).default({}),
  hobbies: z.array(z.string()).default([]),
  frequentlyLostWords: z.array(z.string()).default([]),
});
export type Profile = z.infer<typeof ProfileSchema>;

export async function loadProfile(path: string): Promise<Profile> {
  return ProfileSchema.parse(JSON.parse(await readFile(path, 'utf8')));
}

// Every personal word in the profile, as a flat list.
export function profileTermList(profile: Profile): string[] {
  return [
    ...Object.values(profile.people),
    ...Object.values(profile.pets),
    ...Object.values(profile.places),
    ...profile.hobbies,
    ...profile.frequentlyLostWords,
  ];
}

// The profile as one line for the prompt, with what each word is ("dog Biscuit", "local shop Corner
// Mart"), so the guesser can tell a person from a place and match a description to the right one.
export function profileForPrompt(profile: Profile): string {
  const named = (group: Record<string, string>) =>
    Object.entries(group).map(([role, name]) => `${role} ${name}`);
  return [
    ...(profile.name ? [`user ${profile.name}`] : []),
    ...(profile.role ? [`role ${profile.role}`] : []),
    ...named(profile.people),
    ...named(profile.pets),
    ...named(profile.places),
    ...(profile.hobbies.length > 0 ? [`hobbies ${profile.hobbies.join(', ')}`] : []),
    ...(profile.frequentlyLostWords.length > 0
      ? [`often forgets ${profile.frequentlyLostWords.join(', ')}`]
      : []),
  ].join('; ');
}

// What the page's "About you" section sends (see events.ts): a name, a role, the words the user
// often needs, and words accepted in earlier meetings.
export interface UiProfile {
  name?: string | undefined;
  role?: string | undefined;
  words: string[];
  remembered: string[];
}

// The profile the guesser sees: the file's, with the page's words added after it. The page's name
// and role win over the file's. Words are deduplicated ignoring case; the user's own words come
// before remembered ones, so that if the speech recogniser's budget runs out the remembered go first.
export function mergeProfiles(
  file: Profile | undefined,
  ui: UiProfile | undefined,
): Profile | undefined {
  const name = ui?.name?.trim() || file?.name;
  const role = ui?.role?.trim() || file?.role;
  const words = [
    ...(file?.frequentlyLostWords ?? []),
    ...(ui?.words ?? []),
    ...(ui?.remembered ?? []),
  ];
  if (!file && !name && !role && words.length === 0) return undefined;
  const seen = new Set<string>();
  const unique = words.filter((w) => {
    const key = w.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return ProfileSchema.parse({
    ...file,
    ...(name ? { name } : {}),
    ...(role ? { role } : {}),
    frequentlyLostWords: unique,
  });
}
