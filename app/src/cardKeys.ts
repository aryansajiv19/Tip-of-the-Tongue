// The global shortcuts held while a suggestion is on screen. Pure, so it can be tested without
// Electron. The overlay never takes focus, so Esc and Cmd/Ctrl+1..3 have to be global shortcuts,
// and they are held only while the card is up and the window is visible: never taken from other
// apps otherwise.
export type CardKey = 'escape' | 1 | 2 | 3;

const SHORTCUTS: [string, CardKey][] = [
  ['Escape', 'escape'],
  ['CommandOrControl+1', 1],
  ['CommandOrControl+2', 2],
  ['CommandOrControl+3', 3],
];

// What the page asked for: how many suggestions can be picked (0 to 3), or null for "none, and
// no Esc either". Anything else is ignored (undefined), so a bad message changes nothing.
export function parseCapture(payload: unknown): { picks: number } | null | undefined {
  if (payload === null) return null;
  const picks = (payload as { picks?: unknown } | undefined)?.picks;
  if (typeof picks !== 'number' || !Number.isInteger(picks) || picks < 0 || picks > 3) {
    return undefined;
  }
  return { picks };
}

// The shortcuts that should be registered: Esc, and one per pickable suggestion.
export function wantedShortcuts(
  capture: { picks: number } | null,
  windowVisible: boolean,
): [string, CardKey][] {
  if (!capture || !windowVisible) return [];
  return SHORTCUTS.filter(([, key]) => key === 'escape' || key <= capture.picks);
}

export const allCardShortcuts = (): string[] => SHORTCUTS.map(([accelerator]) => accelerator);
