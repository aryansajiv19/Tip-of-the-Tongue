import { afterEach, describe, expect, it, vi } from 'vitest';
import { HELP_KEYS, HELP_LABELS, helpHint, isHelpLevel, savedHelp, saveHelp } from './help';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => void (data[k] = v),
  });
  return data;
}

afterEach(() => vi.unstubAllGlobals());

describe('help level', () => {
  it('is null until the user chooses, then remembered', () => {
    const data = fakeStorage();
    expect(savedHelp()).toBeNull();
    saveHelp('sound');
    expect(data['tott.help']).toBe('sound');
    expect(savedHelp()).toBe('sound');
  });

  it('ignores a value it does not know', () => {
    for (const bad of ['', 'off', 'ASK', 'words', '1', 'null']) {
      fakeStorage({ 'tott.help': bad });
      expect(savedHelp()).toBeNull();
    }
    expect(isHelpLevel('ask') && isHelpLevel('sound') && isHelpLevel('word')).toBe(true);
    expect(isHelpLevel('off')).toBe(false);
  });

  it('survives storage that throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    });
    expect(savedHelp()).toBeNull();
    expect(() => saveHelp('word')).not.toThrow();
  });

  it('has a label and a hint for each choice, naming the right key', () => {
    expect(HELP_KEYS.map((k) => HELP_LABELS[k])).toEqual([
      'First sound',
      'Whole word',
      'Only when I ask',
    ]);
    expect(helpHint('ask', '⌘')).toContain('⌘+Enter');
    expect(helpHint('sound', 'Ctrl')).toContain('Ctrl+Enter again');
    expect(helpHint('sound', 'Ctrl')).toContain('w…');
    expect(helpHint('word', 'Ctrl')).not.toContain('Ctrl');
  });
});
