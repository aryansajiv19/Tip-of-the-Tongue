import { describe, expect, it } from 'vitest';
import { appearsIn } from './source.js';

describe('appearsIn', () => {
  it('finds a whole word, ignoring case', () => {
    expect(appearsIn('Renewal of the analytics licence', 'renewal')).toBe(true);
    expect(appearsIn('renewal of the analytics licence', 'LICENCE')).toBe(true);
  });

  it('does not find a word inside a longer word', () => {
    expect(appearsIn('the names of the owners', 'Ames')).toBe(false);
    expect(appearsIn('pharmacies are open', 'pharmacy')).toBe(false);
    expect(appearsIn('subrenewal', 'renewal')).toBe(false);
  });

  it('finds a phrase, whatever the spacing between its words', () => {
    expect(appearsIn('We use Northwind Analytics for reports', 'northwind analytics')).toBe(true);
    expect(appearsIn('Northwind\n  Analytics', 'Northwind Analytics')).toBe(true);
    expect(appearsIn('Northwind and Analytics', 'Northwind Analytics')).toBe(false);
  });

  it('sees through punctuation next to the word', () => {
    expect(appearsIn('Costs: (renewal), then "licence".', 'renewal')).toBe(true);
    expect(appearsIn('Costs: (renewal), then "licence".', 'licence')).toBe(true);
    expect(appearsIn('end of Q3.', 'Q3')).toBe(true);
  });

  it('works with accented letters and digits', () => {
    expect(appearsIn('Café Müller, SOC 2 report', 'müller')).toBe(true);
    expect(appearsIn('Café Müller', 'Müll')).toBe(false);
    expect(appearsIn('SOC 2 report', 'SOC 2')).toBe(true);
    expect(appearsIn('SOC 22 report', 'SOC 2')).toBe(false);
  });

  it('treats regular-expression characters as plain text', () => {
    expect(appearsIn('the C++ (beta) build', 'C++')).toBe(true);
    expect(appearsIn('the C+++ build', 'C++')).toBe(true); // only letters and digits are word edges
    expect(appearsIn('a.b is not axb', 'a.b')).toBe(true);
    expect(appearsIn('axb', 'a.b')).toBe(false);
    expect(appearsIn('price $5 (net)', '(net)')).toBe(true);
    expect(appearsIn('price $5 net', '(net)')).toBe(false);
    expect(() => appearsIn('x', '[unclosed')).not.toThrow();
    expect(() => appearsIn('x', '\\')).not.toThrow();
  });

  it('is false for an empty phrase or empty text', () => {
    expect(appearsIn('anything', '')).toBe(false);
    expect(appearsIn('anything', '   ')).toBe(false);
    expect(appearsIn('', 'word')).toBe(false);
  });

  it('copes with a 50,000 character document', () => {
    const text = `${'lorem ipsum '.repeat(4500)}needle`;
    expect(appearsIn(text, 'needle')).toBe(true);
    expect(appearsIn(text, 'haystack')).toBe(false);
  });
});
