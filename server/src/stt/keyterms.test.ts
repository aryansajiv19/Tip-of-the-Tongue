import { describe, expect, it } from 'vitest';
import { ProfileSchema } from '../guess/profile.js';
import { selectKeyterms, termsFromText } from './keyterms.js';

describe('termsFromText', () => {
  it('finds names, acronyms and figures with digits', () => {
    const text = 'We meet Henley Health about the SOC 2 report and Q3 numbers with Priya.';
    expect(termsFromText(text)).toEqual(['Henley Health', 'SOC 2', 'Q3', 'Priya']);
  });
  it('skips a word that is capitalised only because it starts a sentence', () => {
    expect(termsFromText('The plan is ready. Then we ship it. Lumenfield agrees.')).toEqual([]);
  });
  it('keeps a sentence-start name when the next word is capitalised too', () => {
    expect(termsFromText('Henley Health will not sign yet.')).toEqual(['Henley Health']);
  });
  it('splits at commas and full stops', () => {
    expect(termsFromText('We visit Leeds, Lisbon and Toronto.')).toEqual([
      'Leeds',
      'Lisbon',
      'Toronto',
    ]);
  });
  it('finds mixed-case and hyphenated technical words', () => {
    expect(termsFromText('use the ARR and NRR figures from ISO 27001 and EBITDA')).toEqual([
      'ARR',
      'NRR',
      'ISO 27001',
      'EBITDA',
    ]);
  });
  it('returns nothing for plain lower-case text or an empty string', () => {
    expect(termsFromText('we talk about the weather')).toEqual([]);
    expect(termsFromText('')).toEqual([]);
  });
});

describe('selectKeyterms', () => {
  const profile = ProfileSchema.parse({
    people: { daughter: 'Priya' },
    pets: { dog: 'Biscuit' },
    places: { shop: 'Corner Mart' },
    hobbies: ['snooker'],
  });

  it('puts the profile first, then the brief terms', () => {
    expect(
      selectKeyterms({ profile, brief: 'Review with Northwind and the SOC 2 audit.' }),
    ).toEqual(['Priya', 'Biscuit', 'Corner Mart', 'snooker', 'Northwind', 'SOC 2']);
  });
  it('uses the glossary instead of scanning the brief when there is one', () => {
    const out = selectKeyterms({ brief: 'Northwind', glossary: 'churn rate, SOC 2, ARR' });
    expect(out).toEqual(['churn rate', 'SOC 2', 'ARR']);
  });
  it('removes repeats regardless of case', () => {
    expect(selectKeyterms({ glossary: 'ARR, arr, Arr, NRR' })).toEqual(['ARR', 'NRR']);
  });
  it('drops empty and very long terms', () => {
    expect(selectKeyterms({ glossary: `, ,${'x'.repeat(41)}, ok` })).toEqual(['ok']);
  });
  it('never gives more than 100 terms', () => {
    const glossary = Array.from({ length: 300 }, (_, i) => `t${i}`).join(', ');
    expect(selectKeyterms({ glossary }).length).toBeLessThanOrEqual(100);
  });
  it('stays under the token limit with a safety margin, keeping the earlier terms', () => {
    const glossary = Array.from({ length: 80 }, (_, i) => `longer technical term number ${i}`).join(
      ', ',
    );
    const out = selectKeyterms({ glossary });
    const estimate = out.reduce((n, t) => n + Math.ceil(t.length / 3) + 1, 0);
    expect(estimate).toBeLessThanOrEqual(400);
    expect(out[0]).toBe('longer technical term number 0');
    expect(out.length).toBeLessThan(80);
  });
  it('gives nothing when there is nothing to use', () => {
    expect(selectKeyterms({})).toEqual([]);
  });
});

describe('selectKeyterms with a long personal list', () => {
  it('stays within 100 terms and the token budget, keeping the first words', () => {
    const words = Array.from({ length: 300 }, (_, i) => `word${i}`);
    const out = selectKeyterms({ profile: ProfileSchema.parse({ frequentlyLostWords: words }) });
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out.slice(0, 3)).toEqual(['word0', 'word1', 'word2']);
    expect(out.reduce((n, t) => n + Math.ceil(t.length / 3) + 1, 0)).toBeLessThanOrEqual(400);
  });

  it('stops on tokens before the count when the words are long', () => {
    const words = Array.from({ length: 100 }, (_, i) => `${'long-name-'.repeat(3)}${i}`);
    const out = selectKeyterms({ profile: ProfileSchema.parse({ frequentlyLostWords: words }) });
    expect(out.length).toBeLessThan(100);
    expect(out.reduce((n, t) => n + Math.ceil(t.length / 3) + 1, 0)).toBeLessThanOrEqual(400);
  });

  it('lets the brief terms be squeezed out, never the personal words', () => {
    const words = Array.from({ length: 100 }, (_, i) => `word${i}`);
    const out = selectKeyterms({
      profile: ProfileSchema.parse({ frequentlyLostWords: words }),
      brief: 'Review with Northwind.',
    });
    expect(out).not.toContain('Northwind');
    expect(out).toHaveLength(100);
  });
});
