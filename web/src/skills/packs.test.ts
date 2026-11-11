import { describe, expect, it } from 'vitest';
import { PACKS } from './packs';

describe('PACKS', () => {
  it('has the five built-in packs, with terms', () => {
    expect(PACKS.map((p) => p.id).sort()).toEqual([
      'everyday',
      'finance',
      'interview',
      'medical',
      'tech',
    ]);
    for (const p of PACKS) expect(p.terms.length).toBeGreaterThan(0);
  });
});
