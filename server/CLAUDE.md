# server/

Fastify + `@fastify/websocket`. Entry `src/index.ts`, routes in `src/app.ts`, env in `src/config.ts`.

- `src/session.ts` is the whole pipeline for one connection (buffer → detector → guesser → gate → offer). `src/events.ts` is the WebSocket contract; change it only through the lead.
- One folder per module: `stuck/` (detector, pace, speaker, loudness), `guess/` (guesser, glossary, mock, profile), `gate/`, `accept/`, `transcript/`, `stt/` (Deepgram, keyterms). Pure functions where possible; tests sit next to the code.
- ESM with NodeNext: relative imports end in `.js`. Validate everything from the socket or an LLM with zod.
- Info-level logs hold event types, never words. Debug events are sent only after `session.debug`.
- Packaged-app env (`static.ts`, `app.ts`, `index.ts`): `WEB_DIST` serves the built page on the same port; `TOTT_TOKEN` makes `/ws` require `?token=` (close 4401); `LOG_FILE` sends logs to a file; fatal errors exit(1) so the app restarts the server.
- Failure handling: Anthropic 401/403 → `guesser.status {reason:'key'}`, 429/529 → back off (5–30 s) and skip early guesses; at most 60 Claude calls a minute per session; a 15 s socket heartbeat; Deepgram retries, then falls back to browser speech and probes every 60 s to come back; word times are corrected for audio dropped before Deepgram.
- Language: `session.settings.language` (en, multi, es, fr, de, hi) picks the Deepgram language, the per-language cues in `stuck/languages.ts` and a prompt line in `guess/guesser.ts`.
- Tests never need network access or API keys; Deepgram and Claude are faked.
