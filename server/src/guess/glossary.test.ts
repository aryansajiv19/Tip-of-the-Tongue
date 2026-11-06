import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import {
  briefForGuesser,
  createGlossaryBuilder,
  LONG_BRIEF_CHARS,
  parseGlossary,
} from './glossary.js';

const cfg = { model: 'claude-haiku-5-5', timeoutMs: 1000 };
const fakeClient = (create: (...args: unknown[]) => unknown): Pick<Anthropic, 'messages'> =>
  ({ messages: { create } }) as unknown as Pick<Anthropic, 'messages'>;
const reply = (text: string) => Promise.resolve({ content: [{ type: 'text', text }] });

describe('parseGlossary', () => {
  it('joins comma, line and bullet lists into one line', () => {
    expect(parseGlossary('- churn rate\n- SOC 2\n3. ARR, "NRR"; Henley Health')).toBe(
      'churn rate, SOC 2, ARR, NRR, Henley Health',
    );
  });
  it('keeps figures that start with a number or a dash', () => {
    expect(parseGlossary('14.2 million, 2.4%, -5% margin, 1. 99.9% SLA')).toBe(
      '14.2 million, 2.4%, -5% margin, 99.9% SLA',
    );
  });
  it('removes repeats regardless of case and keeps the first spelling', () => {
    expect(parseGlossary('SOC 2, soc 2, Soc 2, ARR')).toBe('SOC 2, ARR');
  });
  it('keeps at most 60 terms', () => {
    const many = Array.from({ length: 100 }, (_, i) => `term${i}`).join(', ');
    expect(parseGlossary(many)?.split(', ')).toHaveLength(60);
  });
  it('is undefined for an empty or blank reply', () => {
    expect(parseGlossary('')).toBeUndefined();
    expect(parseGlossary(' , \n ; ')).toBeUndefined();
  });
});

describe('briefForGuesser', () => {
  const long = 'a'.repeat(LONG_BRIEF_CHARS + 1);
  it('passes a short brief through whole, even if a glossary exists', () => {
    const doc = 'Q3 review with Northwind';
    expect(briefForGuesser(doc, 'x, y')).toBe(doc);
    expect(briefForGuesser('b'.repeat(LONG_BRIEF_CHARS), 'x')).toBe('b'.repeat(LONG_BRIEF_CHARS));
  });
  it('gives a long document as glossary plus its first 1500 characters', () => {
    const out = briefForGuesser(long, 'churn rate, SOC 2');
    expect(out).toBe(`Key terms: churn rate, SOC 2\n\n${'a'.repeat(1500)}`);
  });
  it('gives only the start of a long document while there is no glossary', () => {
    expect(briefForGuesser(long)).toBe('a'.repeat(1500));
  });
});

describe('createGlossaryBuilder', () => {
  it('returns a cleaned glossary from the model reply', async () => {
    const build = createGlossaryBuilder(
      cfg,
      fakeClient(() => reply('churn rate, SOC 2\nARR')),
    );
    expect(await build('doc')).toBe('churn rate, SOC 2, ARR');
  });
  it('sends the document as the user message with a small output cap', async () => {
    let params: Record<string, unknown> = {};
    const build = createGlossaryBuilder(
      cfg,
      fakeClient((p) => {
        params = p as Record<string, unknown>;
        return reply('a');
      }),
    );
    await build('the whole document');
    expect(params).toMatchObject({ model: 'claude-haiku-5-5' });
    expect(params.messages).toEqual([{ role: 'user', content: 'the whole document' }]);
    expect(params.max_tokens).toBeLessThanOrEqual(800);
  });
  it('gives nothing, and does not throw, when the call fails', async () => {
    const failing = fakeClient(() => Promise.reject(new Error('529 overloaded')));
    expect(await createGlossaryBuilder(cfg, failing)('doc')).toBeUndefined();
    const sync = fakeClient(() => {
      throw new Error('boom');
    });
    expect(await createGlossaryBuilder(cfg, sync)('doc')).toBeUndefined();
  });
  it('gives nothing for an empty reply', async () => {
    expect(
      await createGlossaryBuilder(
        cfg,
        fakeClient(() => reply('')),
      )('doc'),
    ).toBeUndefined();
  });
  it('does nothing without an API key', async () => {
    expect(await createGlossaryBuilder(cfg)('doc')).toBeUndefined();
  });
});
