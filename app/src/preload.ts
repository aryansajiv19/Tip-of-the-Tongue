import { contextBridge, ipcRenderer } from 'electron';

type Command = 'toggle-listening' | 'manual' | 'new-conversation';

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
  report(state: { listening: boolean }) {
    ipcRenderer.send('overlay:state', state);
  },
});
