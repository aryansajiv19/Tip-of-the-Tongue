# app/

Electron desktop app. Two modes:

- **Development** (`npm run app`): the renderer is the Vite page at `http://localhost:5173`; `children.ts` starts the server and Vite as child processes and kills them on quit. Keys come from `.env` unless saved in the app.
- **Installed** (`npm run dist` at the root → `release/*.dmg`, unsigned): `scripts/bundle-server.mjs` bundles the server with esbuild; `serverProcess.ts` runs it as a `utilityProcess` on port 47821 with `WEB_DIST` (the built page), a per-launch `TOTT_TOKEN` (the page loads `/?token=…`), `LOG_FILE` and the saved keys. `supervisor.ts` restarts it once; `port.ts` checks the port first; `log.ts` writes a rotating `app.log` under userData (tokens redacted, no words). Single-instance lock; the tray shows Starting… / Couldn't start + Retry.
- Keys: `keyStore.ts` (Electron `safeStorage`, never written in plain text) and `keyCheck.ts` (one GET to each provider); the page gets only `window.tott.keys.{status, save, test}` and can never read a key back. Saving restarts the server.
- External links open in the system browser (https only); the window never navigates away.

- Main process is CommonJS (`dist/`, built by `tsc`); `src/placement.ts` is pure and unit-tested, the rest is thin glue.
- Never call `setContentProtection`: the overlay must show in screenshots and screen shares.
- The window must not steal focus: show it with `showInactive()`.
- The preload bridge (`window.tott`) is the only way the page reaches the main process; keep it in step with `web/src/ui/desktop.ts`.
- Tray icon: `assets/trayTemplate.png` is a placeholder for the Hiya logo (keep the `Template` suffix so macOS tints it).
- Ports: `TOTT_WEB_PORT` (5173) and `TOTT_SERVER_PORT` (3000).
- Daily use: the tray has Settings… and Recent words (they show the overlay, then send `open-settings` / `open-recent` over the command channel), Start at login (installed app only), Reset window position, and a solid-disc icon while listening. The overlay's position is saved to `userData/window.json` after a drag and fitted back onto a screen at launch (`placement.ts`); dragging needs `-webkit-app-region: drag` on the pill in the page.
