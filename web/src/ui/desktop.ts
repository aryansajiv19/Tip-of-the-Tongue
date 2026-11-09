import { useEffect, useRef } from 'react';
import type { Check, Presence } from '../settings/keys';
import { commandForKey, type Command } from './commands';

// What the desktop app's preload script exposes. Absent in a normal browser.
export interface DesktopBridge {
  onCommand(cb: (command: Exclude<Command, 'toggle-visible'>) => void): () => void;
  setHeight(px: number): void;
  // While a suggestion is on screen the main process hands over Esc, and Cmd/Ctrl+1..`picks` (the
  // overlay never takes focus, so these have to be global shortcuts). Returns a function that
  // gives them back.
  captureCardKeys(picks: number, cb: (key: 'escape' | 1 | 2 | 3) => void): () => void;
  report(state: { listening: boolean }): void;
  // The user's own provider keys. Absent before the keys backend exists, and in a browser.
  keys?: {
    status(): Promise<{ anthropic: Presence; deepgram: Presence }>;
    // An omitted field keeps its key, an empty string removes it; the server restarts.
    save(keys: { anthropic?: string; deepgram?: string }): Promise<void>;
    test(): Promise<{ anthropic: Check; deepgram: Check }>;
  };
}

export const desktop = (window as unknown as { tott?: DesktopBridge }).tott;

// Runs `handler` for keyboard shortcuts in a browser, or for tray and global-shortcut commands
// in the desktop app (where the main process owns the keys and the window's visibility).
export function useCommands(handler: (command: Command) => void) {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });

  useEffect(() => {
    if (desktop) return desktop.onCommand((c) => latest.current(c));
    const onKey = (e: KeyboardEvent) => {
      const command = commandForKey(e);
      if (!command) return;
      e.preventDefault();
      latest.current(command);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

// The desktop app has no browser speech service of its own (Electron has no Google speech key),
// so there the only fix is a Deepgram key.
export const SPEECH_UNREACHABLE = desktop
  ? 'Speech needs a Deepgram key in the desktop app. Add one in Settings, then press Start.'
  : 'Speech recognition cannot reach its service. Check your connection; I keep trying.';

// Where the user turns the microphone back on differs between the app and a browser tab.
export const MIC_BLOCKED = `Microphone access was blocked. Allow it in ${
  desktop ? 'System Settings > Privacy & Security > Microphone' : 'the browser address bar'
}, then press Start.`;
