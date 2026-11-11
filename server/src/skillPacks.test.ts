import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ClientEventSchema } from './events.js';

const dir = new URL('../../data/skills/', import.meta.url);
const Pack = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  terms: z.array(z.string()),
  hint: z.string(),
});
const packs = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({ file: f, pack: Pack.parse(JSON.parse(readFileSync(new URL(f, dir), 'utf8'))) }));

describe('built-in skill packs', () => {
  it('are the five we ship', () => {
    expect(packs.map((p) => p.pack.id).sort()).toEqual([
      'everyday',
      'finance',
      'interview',
      'medical',
      'tech',
    ]);
  });

  it.each(packs)('$file is well formed and accepted by session.skills', ({ file, pack }) => {
    expect(file).toBe(`${pack.id}.json`);
    expect(pack.terms.length).toBeGreaterThanOrEqual(40);
    expect(pack.terms.length).toBeLessThanOrEqual(80);
    expect(new Set(pack.terms.map((t) => t.toLowerCase())).size).toBe(pack.terms.length);
    const event = {
      type: 'session.skills',
      skills: [{ name: pack.name, description: pack.hint, terms: pack.terms }],
    };
    expect(ClientEventSchema.safeParse(event).success).toBe(true);
  });
});
