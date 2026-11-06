# server/

Fastify + `@fastify/websocket`. Entry `src/index.ts`, routes in `src/app.ts`, env in `src/config.ts`.

- `src/events.ts` is the WebSocket contract. Change it only through the lead, because web depends on it.
- One folder per module (`src/stuck/`, `src/guess/`, `src/gate/`, `src/accept/`, `src/transcript/`). Pure functions where possible; tests sit next to the code as `*.test.ts`.
- ESM with NodeNext: relative imports end in `.js`.
- Validate everything that comes in from the socket or from an LLM with zod.
- Tests use `app.inject` and never need network access or API keys.
