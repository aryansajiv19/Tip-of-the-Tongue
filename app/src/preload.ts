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
  // Asks the main process to hand over Esc while a suggestion is on screen, and to stop when
  // the returned function is called.
  captureEscape(cb: () => void) {
    const listener = () => cb();
    ipcRenderer.on('escape', listener);
    ipcRenderer.send('overlay:escape', true);
    return () => {
      ipcRenderer.removeListener('escape', listener);
      ipcRenderer.send('overlay:escape', false);
    };
  },
  report(state: { listening: boolean }) {
    ipcRenderer.send('overlay:state', state);
  },
});
