# web/

Vite + React 19. Vite proxies `/ws` to the server (port from the root `.env`, default 3000).

- Server event types come from `../server/src/events.ts`, imported type-only. Don't redefine them.
- Speech: when the server says `stt: 'deepgram'` the page streams 16 kHz PCM from an AudioWorklet (`public/pcm-worklet.js`); otherwise it runs Chrome's Web Speech API, whose word times are approximate.
- The page is being restyled by the overlay work: check the open PRs before editing `App.tsx`, `app.css`, `offer/`, `ui/`, `settings/`.
- `?debug=1` mounts the debug panel (`src/debug/`) and asks the server for its debug stream.
- Accessibility is never optional: semantic HTML, `role="status"`/`aria-live` for offers, keyboard reachable, no flashing, respect `prefers-reduced-motion`.
