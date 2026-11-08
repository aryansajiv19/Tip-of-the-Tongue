// What the user can ask for from the keyboard or, in the desktop app, from the tray and the
// global shortcuts. The desktop main process sends these names over IPC.
export type Command = 'toggle-visible' | 'toggle-listening' | 'manual' | 'new-conversation';

// Cmd (Mac) or Ctrl (elsewhere) plus \ or Enter.
export function commandForKey(e: {
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
}): Command | null {
  if (e.repeat || e.altKey || e.shiftKey || e.metaKey === e.ctrlKey) return null;
  if (e.code === 'Backslash') return 'toggle-visible';
  if (e.code === 'Enter') return 'manual';
  return null;
}

// What to print on the keycaps.
export function modifierLabel(platform: string): string {
  return /mac|iphone|ipad/i.test(platform) ? '⌘' : 'Ctrl';
}
