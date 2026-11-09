// How the user wants to be helped when stuck. Chosen once on first run, changeable in Settings,
// kept on this device. Until chosen, the whole word is shown (the original behaviour).
export type HelpLevel = 'ask' | 'sound' | 'word';

export const HELP_KEYS: HelpLevel[] = ['sound', 'word', 'ask'];

export const HELP_LABELS: Record<HelpLevel, string> = {
  sound: 'First sound',
  word: 'Whole word',
  ask: 'Only when I ask',
};

// One plain sentence per choice. `modifier` is what the keycaps say: "⌘" or "Ctrl".
export function helpHint(level: HelpLevel, modifier: string): string {
  if (level === 'ask') {
    return `Suggests only when you press ${modifier}+Enter or say something like "what's it called".`;
  }
  if (level === 'sound') {
    return `Shows just the first sound, like "w…". Tap it, or press ${modifier}+Enter again, for the whole word.`;
  }
  return 'Shows the whole suggested word.';
}

const STORAGE_KEY = 'tott.help';

export const isHelpLevel = (v: unknown): v is HelpLevel =>
  v === 'ask' || v === 'sound' || v === 'word';

// The saved choice, or null if the user was never asked.
export function savedHelp(): HelpLevel | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isHelpLevel(v) ? v : null;
  } catch {
    return null;
  }
}

export function saveHelp(level: HelpLevel): void {
  try {
    localStorage.setItem(STORAGE_KEY, level);
  } catch {
    // Private mode: the choice still works for this visit.
  }
}
