# web/

Vite + React 19. Vite proxies `/ws` to the server (port from the root `.env`, default 3000).

- Server event types come from `../server/src/events.ts`, imported type-only. Don't redefine them.
- Default STT is the browser Web Speech API (Chrome, Edge). The browser stamps words with approximate times (`Date.now()`).
- The word pop-up (`src/offer/`) is styled in `offer.css`; the rest of the page is still plain markup.
- Accessibility is never optional: semantic HTML, `role="status"`/`aria-live` for offers, keyboard reachable, no flashing, respect `prefers-reduced-motion`.
