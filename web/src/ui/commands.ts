// What the user can ask for from the keyboard or, in the desktop app, from the tray and the
// global shortcuts. The desktop main process sends these names over IPC.
export type Command = 'toggle-visible' | 'toggle-listening' | 'manual' | 'new-conversation';

// Cmd (Mac) or Ctrl (elsewhere) plus \ or Enter, or plus Shift and N for a new conversation.
export function commandForKey(e: {
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
}): Command | null {
  if (e.repeat || e.altKey || e.metaKey === e.ctrlKey) return null;
  if (e.shiftKey) return e.code === 'KeyN' ? 'new-conversation' : null;
  if (e.code === 'Backslash') return 'toggle-visible';
  if (e.code === 'Enter') return 'manual';
  return null;
}

type KeyInfo = Parameters<typeof commandForKey>[0];

// Cmd (Mac) or Ctrl plus 1, 2 or 3 picks that suggestion: its place in the list (0, 1 or 2).
export function pickForKey(e: KeyInfo): 0 | 1 | 2 | null {
  if (e.repeat || e.altKey || e.shiftKey || e.metaKey === e.ctrlKey) return null;
  const n = /^(?:Digit|Numpad)([123])$/.exec(e.code)?.[1];
  return n === undefined ? null : ((Number(n) - 1) as 0 | 1 | 2);
}

// What to print on the keycaps.
export function modifierLabel(platform: string): string {
  return /mac|iphone|ipad/i.test(platform) ? '⌘' : 'Ctrl';
}
