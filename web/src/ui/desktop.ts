import { useEffect, useRef } from 'react';
import { commandForKey, type Command } from './commands';

// What the desktop app's preload script exposes. Absent in a normal browser.
export interface DesktopBridge {
  onCommand(cb: (command: Exclude<Command, 'toggle-visible'>) => void): () => void;
  setHeight(px: number): void;
  captureEscape(cb: () => void): () => void;
  report(state: { listening: boolean }): void;
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

// Where the user turns the microphone back on differs between the app and a browser tab.
export const MIC_BLOCKED = `Microphone access was blocked. Allow it in ${
  desktop ? 'System Settings > Privacy & Security > Microphone' : 'the browser address bar'
}, then press Start.`;
