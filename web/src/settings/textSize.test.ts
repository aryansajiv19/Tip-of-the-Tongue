import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTextSize, isTextSize, savedTextSize } from './textSize';

function stub(initial: Record<string, string> = {}) {
  const data = { ...initial };
  const root = { dataset: {} as Record<string, string> };
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => void (data[k] = v),
  });
  vi.stubGlobal('document', { documentElement: root });
  return { data, root };
}

afterEach(() => vi.unstubAllGlobals());

describe('text size', () => {
  it('is normal until chosen, and ignores junk', () => {
    stub({ 'tott.textSize': 'huge' });
    expect(savedTextSize()).toBe('normal');
    expect(isTextSize('large')).toBe(true);
    expect(isTextSize('huge')).toBe(false);
  });

  it('applies to the page and is kept; applying at startup does not rewrite it', () => {
    const { data, root } = stub();
    applyTextSize('large');
    expect(root.dataset['textSize']).toBe('large');
    expect(data['tott.textSize']).toBe('large');
    applyTextSize('normal', false);
    expect(root.dataset['textSize']).toBe('normal');
    expect(data['tott.textSize']).toBe('large');
  });
});
