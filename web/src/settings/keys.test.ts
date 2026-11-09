import { describe, expect, it } from 'vitest';
import { checkMessage, keysToSave, needsSetup } from './keys';

describe('checkMessage', () => {
  it('is plain, names the provider, and never shows a code or variable', () => {
    for (const p of ['anthropic', 'deepgram'] as const) {
      for (const c of ['ok', 'invalid', 'unreachable', 'missing'] as const) {
        expect(checkMessage(p, c)).not.toMatch(/API_KEY|\.env|40[13]|429|status/i);
      }
    }
    expect(checkMessage('anthropic', 'invalid')).toContain('Anthropic');
    expect(checkMessage('deepgram', 'unreachable')).toContain('internet');
  });
});

describe('keysToSave', () => {
  it('sends only what was typed, trimmed', () => {
    expect(keysToSave({ anthropic: '  sk-1  ', deepgram: '' })).toEqual({ anthropic: 'sk-1' });
    expect(keysToSave({ anthropic: ' ', deepgram: '' })).toEqual({});
  });
});

describe('needsSetup', () => {
  it('waits for the status, then asks while either key is missing', () => {
    expect(needsSetup(null)).toBe(false);
    expect(needsSetup({ anthropic: 'set', deepgram: 'set' })).toBe(false);
    expect(needsSetup({ anthropic: 'missing', deepgram: 'set' })).toBe(true);
    expect(needsSetup({ anthropic: 'set', deepgram: 'missing' })).toBe(true);
  });
});
