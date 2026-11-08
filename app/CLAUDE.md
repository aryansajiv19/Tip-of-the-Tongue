# app/

Electron shell for the overlay (`npm run app`). The renderer is the existing Vite page at `http://localhost:5173`; the main process starts the server and Vite as children and kills them on quit.

- Main process is CommonJS (`dist/`, built by `tsc`); `src/placement.ts` is pure and unit-tested, the rest is thin glue.
- Never call `setContentProtection`: the overlay must show in screenshots and screen shares.
- The window must not steal focus: show it with `showInactive()`.
- The preload bridge (`window.tott`) is the only way the page reaches the main process; keep it in step with `web/src/ui/desktop.ts`.
- Tray icon: `assets/trayTemplate.png` is a placeholder for the Hiya logo (keep the `Template` suffix so macOS tints it).
- Ports: `TOTT_WEB_PORT` (5173) and `TOTT_SERVER_PORT` (3000).
