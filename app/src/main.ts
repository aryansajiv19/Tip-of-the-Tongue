import fs from 'node:fs';
import path from 'node:path';
import {
  BrowserWindow,
  Menu,
  dialog,
  Tray,
  app,
  globalShortcut,
  ipcMain,
  nativeImage,
  safeStorage,
  screen,
  session,
  shell,
  systemPreferences,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from 'electron';
import crypto from 'node:crypto';
import { startChildren, waitForUrl } from './children';
import { createLog } from './log';
import { portFree } from './port';
import { startServerProcess } from './serverProcess';
import { checkKey } from './keyCheck';
import { KEY_NAMES, createKeyStore } from './keyStore';
import { allCardShortcuts, parseCapture, wantedShortcuts } from './cardKeys';
import {
  MARGIN,
  clampHeight,
  fitOnScreen,
  maxHeight,
  parseSavedPosition,
  placeOverlay,
  type DisplayInfo,
} from './placement';

const ROOT = path.resolve(__dirname, '../..');
// From the repo, the keys live in .env (as they do for the server), so the setup screen knows
// they are there. Real environment variables win.
if (!app.isPackaged) {
  try {
    process.loadEnvFile(path.join(ROOT, '.env'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}
const PORTS = {
  server: Number(process.env.TOTT_SERVER_PORT ?? 3000),
  web: Number(process.env.TOTT_WEB_PORT ?? 5173),
};
// Installed: one fixed loopback port serves the page and the socket (so saved settings keep the
// same origin), and a per-launch token keeps other local programs off the socket.
const PACKAGED = app.isPackaged;
const PACKAGED_PORT = Number(process.env.TOTT_SERVER_PORT ?? 47821);
const TOKEN = crypto.randomBytes(24).toString('hex');
const PAGE_URL = PACKAGED
  ? `http://127.0.0.1:${PACKAGED_PORT}/?token=${TOKEN}`
  : `http://localhost:${PORTS.web}`;
const WIDTH = 420;
const START_HEIGHT = 44;

let win: BrowserWindow | undefined;
let tray: Tray | undefined;
let listening = false;
let capture: { picks: number } | null = null;
const keyStore = createKeyStore(path.join(app.getPath('userData'), 'keys.json'), safeStorage);
const ENV_NAMES = { anthropic: 'ANTHROPIC_API_KEY', deepgram: 'DEEPGRAM_API_KEY' } as const;
// A saved key wins; in development a key in .env still works when nothing is saved.
const keyOf = (name: (typeof KEY_NAMES)[number]) =>
  keyStore.get(name) || process.env[ENV_NAMES[name]] || undefined;
const savedKeys = () =>
  Object.fromEntries(
    KEY_NAMES.flatMap((name) => {
      const key = keyStore.get(name);
      return key ? [[ENV_NAMES[name], key]] : [];
    }),
  );
const log = createLog(path.join(app.getPath('userData'), 'logs', 'app.log'));
// One server at a time; the tray shows how it is doing from the first moment.
type ServerStatus =
  { state: 'starting' } | { state: 'ready' } | { state: 'failed'; reason: string };
let status: ServerStatus = { state: 'starting' };
const setStatus = (next: ServerStatus) => {
  status = next;
  log(next.state === 'failed' ? 'error' : 'info', `server: ${next.state}`);
  tray?.setToolTip(trayTip());
};
const trayTip = () =>
  status.state === 'ready'
    ? 'Tip of the Tongue'
    : status.state === 'starting'
      ? 'Tip of the Tongue: starting…'
      : `Tip of the Tongue: couldn't start (${status.reason})`;

const serverEnv = () => ({
  PORT: String(PACKAGED_PORT),
  WEB_DIST: path.join(process.resourcesPath, 'web'),
  TOTT_TOKEN: TOKEN,
  LOG_FILE: path.join(app.getPath('userData'), 'logs', 'server.log'),
  ...savedKeys(),
});
let server: { restartServer(): void; stop(): void } | undefined;
const children = {
  restartServer: () => server?.restartServer(),
  stop: () => server?.stop(),
};

const displays = (): DisplayInfo[] =>
  screen.getAllDisplays().map((d) => ({ id: d.id, bounds: d.bounds, workArea: d.workArea }));

// Where the user dragged the overlay to, kept across launches.
const POSITION_FILE = path.join(app.getPath('userData'), 'window.json');
function loadPosition() {
  try {
    return parseSavedPosition(JSON.parse(fs.readFileSync(POSITION_FILE, 'utf8')));
  } catch {
    return undefined;
  }
}
let savedPosition = loadPosition();
// The last position we set ourselves, to tell the user's drags from our own moves.
let placedAt: { x: number; y: number } | undefined;

function moveTo(at: { x: number; y: number }) {
  if (!win) return;
  placedAt = at;
  win.setPosition(at.x, at.y);
}

// The remembered position if its screen is still there, else the top right of the screen the
// cursor is on.
function place() {
  if (!win) return;
  const [width = WIDTH, height = START_HEIGHT] = win.getSize();
  const size = { width, height };
  const at =
    (savedPosition && fitOnScreen(savedPosition, size, displays())) ??
    placeOverlay(displays(), screen.getCursorScreenPoint(), size, MARGIN);
  if (at) moveTo(at);
}

function rememberMove() {
  if (!win) return;
  const [x = 0, y = 0] = win.getPosition();
  if (placedAt && placedAt.x === x && placedAt.y === y) return;
  savedPosition = { x, y };
  try {
    fs.writeFileSync(POSITION_FILE, JSON.stringify(savedPosition));
  } catch (err) {
    log('error', `position: not saved (${(err as Error).message})`);
  }
}

function resetPosition() {
  savedPosition = undefined;
  fs.rmSync(POSITION_FILE, { force: true });
  show();
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

const send = (
  command: 'toggle-listening' | 'manual' | 'new-conversation' | 'open-settings' | 'open-recent',
) => win?.webContents.send('command', command);

const statusItems = (): Electron.MenuItemConstructorOptions[] =>
  status.state === 'ready'
    ? []
    : status.state === 'starting'
      ? [{ label: 'Starting…', enabled: false }, { type: 'separator' }]
      : [
          { label: `Couldn't start: ${status.reason}`, enabled: false },
          { label: 'Retry', click: () => void boot() },
          { type: 'separator' },
        ];

const menu = () =>
  Menu.buildFromTemplate([
    ...statusItems(),
    { label: win?.isVisible() ? 'Hide' : 'Show', click: toggle },
    {
      label: listening ? 'Pause listening' : 'Start listening',
      click: () => send('toggle-listening'),
    },
    { label: 'New conversation', click: () => send('new-conversation') },
    { label: 'Settings…', enabled: Boolean(win), click: () => showAnd('open-settings') },
    { label: 'Recent words', enabled: Boolean(win), click: () => showAnd('open-recent') },
    { type: 'separator' },
    // Only the installed app: in development this would register the Electron binary itself.
    ...(PACKAGED
      ? [
          {
            label: 'Start at login',
            type: 'checkbox' as const,
            checked: app.getLoginItemSettings().openAtLogin,
            click: (item: Electron.MenuItem) =>
              app.setLoginItemSettings({ openAtLogin: item.checked }),
          },
        ]
      : []),
    { label: 'Reset window position', click: resetPosition },
    { type: 'separator' },
    { label: 'Quit', role: 'quit' },
  ]);

// Brings the overlay up first, so the page it is asked to open is visible.
function showAnd(command: 'open-settings' | 'open-recent') {
  show();
  send(command);
}

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
  // Links (such as "Get a key") open in the system browser, https only; the overlay itself never
  // navigates away from the app page.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, to) => {
    if (new URL(to).origin !== new URL(PAGE_URL).origin) event.preventDefault();
  });
  win.loadURL(PAGE_URL).catch((err: Error) => log('error', `page: ${err.message}`));
  win.once('ready-to-show', show);
  win.on('moved', rememberMove);
  win.on('show', syncCardKeys);
  win.on('hide', syncCardKeys);
}

// A ring with a dot while idle, a solid disc while listening (the "Template" suffix lets macOS tint it).
function trayIcon(isListening: boolean) {
  const name = isListening ? 'trayListeningTemplate.png' : 'trayTemplate.png';
  const icon = nativeImage.createFromPath(path.join(__dirname, '../assets', name));
  icon.setTemplateImage(true);
  return icon;
}

function createTray() {
  tray = new Tray(trayIcon(listening));
  tray.setToolTip(trayTip());
  // Until it is ready there is no window to toggle, so a click shows the status instead.
  tray.on('click', () => (status.state === 'ready' ? toggle() : tray?.popUpContextMenu(menu())));
  tray.on('right-click', () => tray?.popUpContextMenu(menu()));
}

function wire() {
  // The page tells us how tall it is, and whether the mic is live.
  ipcMain.on('overlay:height', (event: IpcMainEvent, px: unknown) => {
    if (event.sender !== win?.webContents) return;
    const { workArea } = screen.getDisplayMatching(win.getBounds());
    const height = clampHeight(px, maxHeight(workArea));
    if (height === undefined) return;
    win.setContentSize(WIDTH, height);
    // Growing downwards must not push the window off the bottom of the screen.
    if (savedPosition) place();
  });
  ipcMain.on('overlay:state', (event: IpcMainEvent, state: unknown) => {
    if (event.sender !== win?.webContents) return;
    listening = Boolean((state as { listening?: unknown } | null)?.listening);
    tray?.setImage(trayIcon(listening));
  });

  ipcMain.on('overlay:card-keys', (event: IpcMainEvent, payload: unknown) => {
    const next = parseCapture(payload);
    if (event.sender !== win?.webContents || next === undefined) return;
    capture = next;
    syncCardKeys();
  });

  // Only the overlay page may ask; keys go in, never back out.
  const fromPage = (event: IpcMainInvokeEvent) => event.sender === win?.webContents;
  ipcMain.handle('keys:status', (event) => {
    if (!fromPage(event)) throw new Error('not allowed');
    return Object.fromEntries(KEY_NAMES.map((n) => [n, keyOf(n) ? 'set' : 'missing']));
  });
  ipcMain.handle('keys:save', (event, keys: unknown) => {
    if (!fromPage(event)) throw new Error('not allowed');
    if (typeof keys !== 'object' || keys === null) throw new Error('expected an object');
    keyStore.save(keys);
    children.restartServer();
  });
  ipcMain.handle('keys:test', async (event) => {
    if (!fromPage(event)) throw new Error('not allowed');
    const results = await Promise.all(KEY_NAMES.map((n) => checkKey(n, keyOf(n))));
    return Object.fromEntries(KEY_NAMES.map((n, i) => [n, results[i]]));
  });

  globalShortcut.register('CommandOrControl+\\', toggle);
  globalShortcut.register('CommandOrControl+Enter', () => send('manual'));
  globalShortcut.register('CommandOrControl+Shift+N', () => send('new-conversation'));

  screen.on('display-added', place);
  screen.on('display-removed', place);
  screen.on('display-metrics-changed', place);
}

const MIC_HELP = {
  type: 'warning' as const,
  message: 'Tip of the Tongue cannot use the microphone',
  detail:
    'Microphone access is switched off for this app. Open System Settings › Privacy & Security › Microphone, switch Tip of the Tongue on, then start listening again.',
  buttons: ['Open System Settings', 'Not now'],
  defaultId: 0,
};

async function askForMicrophone() {
  if (process.platform !== 'darwin') return;
  if (await systemPreferences.askForMediaAccess('microphone')) return;
  log('info', 'microphone: access denied');
  const { response } = await dialog.showMessageBox(MIC_HELP);
  if (response === 0) {
    void shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
    );
  }
}

// Starts (or restarts) the server and opens the overlay once it answers. The page, which carries
// the token in its address, is only loaded after our own server is known to be up, never from a
// port someone else holds.
async function boot() {
  setStatus({ state: 'starting' });
  server?.stop();
  let failed: string | undefined;
  const fail = (reason: string) => {
    failed = reason;
    setStatus({ state: 'failed', reason });
  };
  if (PACKAGED) {
    if (!(await portFree(PACKAGED_PORT))) {
      fail(`port ${PACKAGED_PORT} is in use by another app`);
      return;
    }
    server = startServerProcess({
      script: path.join(process.resourcesPath, 'server/index.mjs'),
      env: serverEnv,
      onFail: fail,
    });
  } else {
    server = startChildren(ROOT, PORTS, savedKeys);
  }
  const health = PACKAGED
    ? `http://127.0.0.1:${PACKAGED_PORT}/health`
    : `http://localhost:${PORTS.web}`;
  try {
    await waitForUrl(health, 60_000, () => failed !== undefined);
  } catch (err) {
    if (failed === undefined) fail((err as Error).message.replace(/\.$/, ''));
    return;
  }
  if (failed !== undefined) return;
  setStatus({ state: 'ready' });
  if (win) win.loadURL(PAGE_URL).catch((err: Error) => log('error', `page: ${err.message}`));
  else createWindow();
}

// A second launch brings the running app forward instead of starting another server.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (status.state === 'ready') show();
    else tray?.popUpContextMenu(menu());
  });
  process.on('uncaughtException', (err) => log('error', `main: uncaught ${err.stack ?? err}`));
  process.on('unhandledRejection', (reason) => log('error', `main: unhandled rejection ${reason}`));

  void app.whenReady().then(async () => {
    app.dock?.hide();
    // The page may use the microphone; nothing else.
    session.defaultSession.setPermissionRequestHandler((_wc, permission, allow) =>
      allow(permission === 'media'),
    );
    createTray();
    wire();
    void askForMicrophone();
    await boot();
  });
}

// A menu-bar app: closing the window is not quitting.
app.on('window-all-closed', () => undefined);
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  children.stop();
});
