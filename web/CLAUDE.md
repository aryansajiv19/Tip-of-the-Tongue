# web/

Vite + React 19. Vite proxies `/ws` to the server (port from the root `.env`, default 3000).

- Server event types come from `../server/src/events.ts`, imported type-only. Don't redefine them.
- Default STT is the browser Web Speech API (Chrome, Edge). The browser stamps words with approximate times (`Date.now()`).
- The page is only the overlay: the control pill (`src/ui/ControlPill.tsx`) and the suggestion card slot under it, fixed at the top right. Styles use only the variables in `src/ui/tokens.css`. Developer tools (transcript, brief, no-mic input, debug panel) show only with `?debug=1`.
- Pure logic (timer, mode, waveform bars, shortcuts) lives next to the components in `src/ui/` with unit tests. `src/ui/desktop.ts` is the bridge to the Electron app; it is absent in a browser.
- Accessibility is never optional: semantic HTML, `role="status"`/`aria-live` for offers, keyboard reachable, no flashing, respect `prefers-reduced-motion`.
