# web/

Vite + React 19. Vite proxies `/ws` to the server (port from the root `.env`, default 3000).

- Server event types come from `../server/src/events.ts`, imported type-only. Don't redefine them.
- Speech: when the server says `stt: 'deepgram'` the page captures at the device's own rate (`public/pcm-worklet.js`), resamples to 16 kHz (`src/audio/resample.ts`) and streams PCM; otherwise it runs the browser's Web Speech API in the chosen language, whose word times are approximate. Capture keeps echo cancellation and auto gain on, noise suppression off (`src/audio/useMic.ts`). Languages without spaces are split with `Intl.Segmenter` (`src/speech/stampWords.ts`).
- The socket URL carries `?token=` when the page was loaded with one (`socketUrl()` in `src/socket/protocol.ts`); one tab listens at a time (`navigator.locks`).
- First run: the help question, then Play. In the desktop app the setup screen (`src/ui/Setup.tsx`, `KeysForm.tsx`) shows when keys are missing; a Demo banner shows whenever `session.ready.guesser === 'mock'`. Settings holds help level, speed, language, text size, keys and Privacy.
- The page is only the overlay: the control pill (`src/ui/ControlPill.tsx`) and the suggestion card slot under it, fixed at the top right. Sizes: overlay 420 px wide, pill 56 px, every button at least `--target` (44 px), label and status text at least 14 px; e2e/sizes.e2e.ts checks it. Styles use only the variables in `src/ui/tokens.css`. Developer tools (transcript, brief, no-mic input, debug panel) show only with `?debug=1`.
- Pure logic (timer, mode, waveform bars, shortcuts) lives next to the components in `src/ui/` with unit tests. `src/ui/desktop.ts` is the bridge to the Electron app; it is absent in a browser.
- Meeting prep: `src/ui/PrepDrawer.tsx` reads a dropped file with `src/ui/readDocument.ts` (pdf.js is loaded only when a PDF is dropped) and sends it as the brief.
- `?debug=1` mounts the debug panel (`src/debug/`) and asks the server for its debug stream.
- Accessibility is never optional: semantic HTML, `role="status"`/`aria-live` for offers, keyboard reachable, no flashing, respect `prefers-reduced-motion`.
