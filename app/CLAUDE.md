# app/

Electron shell for the overlay (`npm run app`). The renderer is the existing Vite page at `http://localhost:5173`; the main process starts the server and Vite as children and kills them on quit.

- Main process is CommonJS (`dist/`, built by `tsc`); `src/placement.ts` is pure and unit-tested, the rest is thin glue.
- Never call `setContentProtection`: the overlay must show in screenshots and screen shares.
- The window must not steal focus: show it with `showInactive()`.
- The preload bridge (`window.tott`) is the only way the page reaches the main process; keep it in step with `web/src/ui/desktop.ts`.
- Tray icon: `assets/trayTemplate.png` is a placeholder for the Hiya logo (keep the `Template` suffix so macOS tints it).
- Ports: `TOTT_WEB_PORT` (5173) and `TOTT_SERVER_PORT` (3000).
- Daily use: the tray has Settings… and Recent words (they show the overlay, then send `open-settings` / `open-recent` over the command channel), Start at login (installed app only), Reset window position, and a solid-disc icon while listening. The overlay's position is saved to `userData/window.json` after a drag and fitted back onto a screen at launch (`placement.ts`); dragging needs `-webkit-app-region: drag` on the pill in the page.
