import path from 'node:path';
import {
  BrowserWindow,
  Menu,
  Tray,
  app,
  globalShortcut,
  ipcMain,
  nativeImage,
  screen,
  session,
  systemPreferences,
  type IpcMainEvent,
} from 'electron';
import { startChildren, waitForUrl } from './children';
import { allCardShortcuts, parseCapture, wantedShortcuts } from './cardKeys';
import { MARGIN, clampHeight, placeOverlay, type DisplayInfo } from './placement';

const ROOT = path.resolve(__dirname, '../..');
const PORTS = {
  server: Number(process.env.TOTT_SERVER_PORT ?? 3000),
  web: Number(process.env.TOTT_WEB_PORT ?? 5173),
};
const URL = `http://localhost:${PORTS.web}`;
const WIDTH = 340;
const START_HEIGHT = 44;

let win: BrowserWindow | undefined;
let tray: Tray | undefined;
let listening = false;
let capture: { picks: number } | null = null;
const children = startChildren(ROOT, PORTS);

const displays = (): DisplayInfo[] =>
  screen.getAllDisplays().map((d) => ({ id: d.id, bounds: d.bounds, workArea: d.workArea }));

// Top right of the screen the cursor is on.
function place() {
  if (!win) return;
  const [width = WIDTH, height = START_HEIGHT] = win.getSize();
  const at = placeOverlay(displays(), screen.getCursorScreenPoint(), { width, height }, MARGIN);
  if (at) win.setPosition(at.x, at.y);
}

function show() {
  if (!win) return;
  place();
  // Shows without taking focus, so it never pulls the user out of what they are typing.
  win.showInactive();
}

// Esc and Cmd/Ctrl+1..3 are global shortcuts only while a suggestion is showing and the overlay is
// visible (see cardKeys.ts), so they are never taken from other apps otherwise.
function syncCardKeys() {
  const wanted = wantedShortcuts(capture, Boolean(win?.isVisible()));
  const keep = new Set(wanted.map(([accelerator]) => accelerator));
  for (const accelerator of allCardShortcuts()) {
    if (!keep.has(accelerator) && globalShortcut.isRegistered(accelerator)) {
      globalShortcut.unregister(accelerator);
    }
  }
  for (const [accelerator, key] of wanted) {
    if (!globalShortcut.isRegistered(accelerator)) {
      globalShortcut.register(accelerator, () => win?.webContents.send('card-key', key));
    }
  }
}

function toggle() {
  if (win?.isVisible()) win.hide();
  else show();
}

const send = (command: 'toggle-listening' | 'manual' | 'new-conversation') =>
  win?.webContents.send('command', command);

const menu = () =>
  Menu.buildFromTemplate([
    { label: win?.isVisible() ? 'Hide' : 'Show', click: toggle },
    {
      label: listening ? 'Pause listening' : 'Start listening',
      click: () => send('toggle-listening'),
    },
    { label: 'New conversation', click: () => send('new-conversation') },
    { type: 'separator' },
    { label: 'Quit', role: 'quit' },
  ]);

function createWindow() {
  win = new BrowserWindow({
    width: WIDTH,
    height: START_HEIGHT,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  // Above normal windows and on every desktop. Deliberately NOT content-protected: the overlay
  // must show up in screenshots and screen sharing.
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  void win.loadURL(URL);
  win.once('ready-to-show', show);
  win.on('show', syncCardKeys);
  win.on('hide', syncCardKeys);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '../assets/trayTemplate.png'));
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('Tip of the Tongue');
  tray.on('click', toggle);
  tray.on('right-click', () => tray?.popUpContextMenu(menu()));
}

function wire() {
  // The page tells us how tall it is, and whether the mic is live.
  ipcMain.on('overlay:height', (event: IpcMainEvent, px: unknown) => {
    const height = clampHeight(px);
    if (event.sender !== win?.webContents || height === undefined) return;
    win.setContentSize(WIDTH, height);
  });
  ipcMain.on('overlay:state', (event: IpcMainEvent, state: unknown) => {
    if (event.sender !== win?.webContents) return;
    listening = Boolean((state as { listening?: unknown } | null)?.listening);
  });

  ipcMain.on('overlay:card-keys', (event: IpcMainEvent, payload: unknown) => {
    const next = parseCapture(payload);
    if (event.sender !== win?.webContents || next === undefined) return;
    capture = next;
    syncCardKeys();
  });

  globalShortcut.register('CommandOrControl+\\', toggle);
  globalShortcut.register('CommandOrControl+Enter', () => send('manual'));
  globalShortcut.register('CommandOrControl+Shift+N', () => send('new-conversation'));

  screen.on('display-added', place);
  screen.on('display-removed', place);
  screen.on('display-metrics-changed', place);
}

void app.whenReady().then(async () => {
  app.dock?.hide();
  // The page may use the microphone; nothing else.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, allow) =>
    allow(permission === 'media'),
  );
  if (process.platform === 'darwin') await systemPreferences.askForMediaAccess('microphone');
  await waitForUrl(URL, 60_000);
  createWindow();
  createTray();
  wire();
});

// A menu-bar app: closing the window is not quitting.
app.on('window-all-closed', () => undefined);
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  children.stop();
});
