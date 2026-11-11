import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveContinuations, savedContinuations } from './continuations';

function stubStorage(data: Record<string, string> = {}) {
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => void (data[k] = v),
    removeItem: (k: string) => void Reflect.deleteProperty(data, k),
  });
  return data;
}
afterEach(() => vi.unstubAllGlobals());

describe('continuations setting', () => {
  it('is off until the user turns it on', () => {
    stubStorage();
    expect(savedContinuations()).toBe(false);
    saveContinuations(true);
    expect(savedContinuations()).toBe(true);
  });

  it('turning it off leaves nothing stored', () => {
    const data = stubStorage({ 'tott.continuations': '1' });
    saveContinuations(false);
    expect(data).toEqual({});
    expect(savedContinuations()).toBe(false);
  });

  it('ignores anything but its own value, and survives missing storage', () => {
    stubStorage({ 'tott.continuations': 'yes' });
    expect(savedContinuations()).toBe(false);
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    });
    expect(savedContinuations()).toBe(false);
    expect(() => saveContinuations(true)).not.toThrow();
  });
});
