import { describe, expect, it } from 'vitest';
import { LANGUAGES } from '../../../server/src/events';
import { LANGUAGE_OPTIONS, isLanguage, speechLang } from './language';

describe('language options', () => {
  it('offer exactly the languages the server accepts, in order', () => {
    expect(LANGUAGE_OPTIONS.map((o) => o.code)).toEqual([...LANGUAGES]);
  });
  it('rejects anything else when read back', () => {
    expect(isLanguage('es')).toBe(true);
    expect(isLanguage('xx')).toBe(false);
    expect(isLanguage(null)).toBe(false);
  });
});

describe('speechLang', () => {
  it.each([
    ['en', 'en-US'],
    ['es', 'es-ES'],
    ['fr', 'fr-FR'],
    ['de', 'de-DE'],
    ['hi', 'hi-IN'],
  ] as const)('%s is %s', (code, tag) => expect(speechLang(code, 'pt-BR')).toBe(tag));

  it('mixed languages follow the browser; nothing chosen leaves the default', () => {
    expect(speechLang('multi', 'pt-BR')).toBe('pt-BR');
    expect(speechLang('multi', '')).toBeUndefined();
    expect(speechLang(null, 'pt-BR')).toBeUndefined();
  });
});
