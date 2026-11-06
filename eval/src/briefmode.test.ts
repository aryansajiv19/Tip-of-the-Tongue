import { describe, expect, it } from 'vitest';
import { applyBriefMode } from './briefmode.js';
import type { Item } from './dataset.js';

const doc = `Start. ${'x'.repeat(4000)} churn rate`;
const item = (over: Partial<Item>): Item => ({
  id: 't',
  context: 'c',
  brief: 'short brief',
  utterance: 'u',
  target: 'churn rate',
  acceptable: ['churn rate'],
  category: 'technical',
  split: 'dev',
  doc: 'd',
  ...over,
});

describe('applyBriefMode', () => {
  const docs = { d: doc };
  it('full gives the whole document', () => {
    expect(applyBriefMode([item({})], 'full', docs, {})[0]?.brief).toBe(doc);
  });
  it('head gives only the start', () => {
    expect(applyBriefMode([item({})], 'head', docs, {})[0]?.brief).toBe(doc.slice(0, 1500));
  });
  it('glossary gives the key terms plus the start', () => {
    const out = applyBriefMode([item({})], 'glossary', docs, { d: 'churn rate' })[0]?.brief;
    expect(out).toBe(`Key terms: churn rate\n\n${doc.slice(0, 1500)}`);
  });
  it('leaves items without a document alone', () => {
    const plain = item({ doc: undefined });
    expect(applyBriefMode([plain], 'full', docs, {})[0]).toBe(plain);
  });
});
