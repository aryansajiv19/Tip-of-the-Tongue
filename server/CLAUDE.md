# server/

Fastify + `@fastify/websocket`. Entry `src/index.ts`, routes in `src/app.ts`, env in `src/config.ts`.

- `src/session.ts` is the whole pipeline for one connection (buffer → detector → guesser → gate → offer). `src/events.ts` is the WebSocket contract; change it only through the lead.
- One folder per module: `stuck/`, `guess/` (guesser, glossary, mock, profile), `gate/`, `accept/`, `transcript/`, `stt/` (Deepgram, keyterms). Pure functions where possible; tests sit next to the code.
- ESM with NodeNext: relative imports end in `.js`. Validate everything from the socket or an LLM with zod.
- Info-level logs hold event types, never words. Debug events are sent only after `session.debug`.
- Tests never need network access or API keys; Deepgram and Claude are faked.
