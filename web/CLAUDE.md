# web/

Vite + React 19. Vite proxies `/ws` to the server (port from the root `.env`, default 3000).

- Server event types come from `../server/src/events.ts`, imported type-only. Don't redefine them.
- Default STT is the browser Web Speech API (Chrome, Edge). The browser stamps words with approximate times (`Date.now()`).
- Functionality first. Plain markup for now; visual design comes in a later phase.
- Accessibility is never optional: semantic HTML, `role="status"`/`aria-live` for offers, keyboard reachable, no flashing, respect `prefers-reduced-motion`.
