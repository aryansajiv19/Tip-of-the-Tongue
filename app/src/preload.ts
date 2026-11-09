import { contextBridge, ipcRenderer } from 'electron';

type Command = 'toggle-listening' | 'manual' | 'new-conversation' | 'open-settings' | 'open-recent';
type Presence = 'set' | 'missing';
type Check = 'ok' | 'invalid' | 'unreachable' | 'missing';

// What the page may do: hear commands from the tray and shortcuts, and tell the window how tall
// it needs to be and whether the mic is live. Matches DesktopBridge in web/src/ui/desktop.ts.
contextBridge.exposeInMainWorld('tott', {
  onCommand(cb: (command: Command) => void) {
    const listener = (_event: unknown, command: Command) => cb(command);
    ipcRenderer.on('command', listener);
    return () => ipcRenderer.removeListener('command', listener);
  },
  setHeight(px: number) {
    ipcRenderer.send('overlay:height', px);
  },
  // Asks the main process to hand over Esc, and Cmd/Ctrl+1..picks, while a suggestion is on
  // screen, and to stop when the returned function is called.
  captureCardKeys(picks: number, cb: (key: 'escape' | 1 | 2 | 3) => void) {
    const listener = (_event: unknown, key: 'escape' | 1 | 2 | 3) => cb(key);
    ipcRenderer.on('card-key', listener);
    ipcRenderer.send('overlay:card-keys', { picks });
    return () => {
      ipcRenderer.removeListener('card-key', listener);
      ipcRenderer.send('overlay:card-keys', null);
    };
  },
  report(state: { listening: boolean }) {
    ipcRenderer.send('overlay:state', state);
  },
  // The user's own provider keys. The page can set and test them but never read them back.
  keys: {
    status: (): Promise<{ anthropic: Presence; deepgram: Presence }> =>
      ipcRenderer.invoke('keys:status'),
    save: (keys: { anthropic?: string; deepgram?: string }): Promise<void> =>
      ipcRenderer.invoke('keys:save', keys),
    test: (): Promise<{ anthropic: Check; deepgram: Check }> => ipcRenderer.invoke('keys:test'),
  },
});
