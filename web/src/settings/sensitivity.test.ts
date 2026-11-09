import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SENSITIVITIES,
  isSensitivity,
  sensitivityHint,
  savedSensitivity,
  saveSensitivity,
} from './sensitivity';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  });
  return data;
}

afterEach(() => vi.unstubAllGlobals());

describe('sensitivity', () => {
  it('maps to the agreed wait and confidence', () => {
    expect(SENSITIVITIES.calm).toMatchObject({ pauseMs: 2500, minConfidence: 0.75 });
    expect(SENSITIVITIES.balanced).toMatchObject({ pauseMs: 1500, minConfidence: 0.6 });
    expect(SENSITIVITIES.eager).toMatchObject({ pauseMs: 900, minConfidence: 0.45 });
  });

  it('stays inside what the server accepts', () => {
    for (const s of Object.values(SENSITIVITIES)) {
      expect(s.pauseMs).toBeGreaterThanOrEqual(800);
      expect(s.pauseMs).toBeLessThanOrEqual(5000);
      expect(s.minConfidence).toBeGreaterThanOrEqual(0.3);
      expect(s.minConfidence).toBeLessThanOrEqual(0.9);
    }
  });

  it('recognises only the three names', () => {
    expect(['calm', 'balanced', 'eager'].every(isSensitivity)).toBe(true);
    expect([undefined, null, '', 'Calm', 'toString', 5].some(isSensitivity)).toBe(false);
  });

  it('saves and reads the choice', () => {
    fakeStorage();
    expect(savedSensitivity()).toBeNull();
    saveSensitivity('eager');
    expect(savedSensitivity()).toBe('eager');
  });

  it('ignores a saved value it does not know', () => {
    fakeStorage({ 'tott.sensitivity': 'wild' });
    expect(savedSensitivity()).toBeNull();
  });

  it('survives storage that throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(savedSensitivity()).toBeNull();
    expect(() => saveSensitivity('calm')).not.toThrow();
  });
});

describe('sensitivityHint', () => {
  it('quotes the real pause for each choice', () => {
    expect(sensitivityHint('calm')).toMatch(/2\.5 s pause/);
    expect(sensitivityHint('balanced')).toMatch(/1\.5 s pause/);
    expect(sensitivityHint('eager')).toMatch(/0\.9 s pause/);
  });
});
