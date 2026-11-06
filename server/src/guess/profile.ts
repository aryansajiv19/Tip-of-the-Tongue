import { readFile } from 'node:fs/promises';
import { z } from 'zod';

// Personal words the guesser may use. Matches data/profiles/example.json; every field is optional.
export const ProfileSchema = z.object({
  note: z.string().optional(),
  name: z.string().optional(),
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
