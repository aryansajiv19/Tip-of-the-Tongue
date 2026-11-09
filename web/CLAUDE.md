# web/

Vite + React 19. Vite proxies `/ws` to the server (port from the root `.env`, default 3000).

- Server event types come from `../server/src/events.ts`, imported type-only. Don't redefine them.
- Speech: when the server says `stt: 'deepgram'` the page streams 16 kHz PCM from an AudioWorklet (`public/pcm-worklet.js`); otherwise it runs Chrome's Web Speech API, whose word times are approximate.
- The page is only the overlay: the control pill (`src/ui/ControlPill.tsx`) and the suggestion card slot under it, fixed at the top right. Sizes: overlay 420 px wide, pill 56 px, every button at least `--target` (44 px), label and status text at least 14 px; e2e/sizes.e2e.ts checks it. Styles use only the variables in `src/ui/tokens.css`. Developer tools (transcript, brief, no-mic input, debug panel) show only with `?debug=1`.
- Pure logic (timer, mode, waveform bars, shortcuts) lives next to the components in `src/ui/` with unit tests. `src/ui/desktop.ts` is the bridge to the Electron app; it is absent in a browser.
- Meeting prep: `src/ui/PrepDrawer.tsx` reads a dropped file with `src/ui/readDocument.ts` (pdf.js is loaded only when a PDF is dropped) and sends it as the brief.
- `?debug=1` mounts the debug panel (`src/debug/`) and asks the server for its debug stream.
- Accessibility is never optional: semantic HTML, `role="status"`/`aria-live` for offers, keyboard reachable, no flashing, respect `prefers-reduced-motion`.
