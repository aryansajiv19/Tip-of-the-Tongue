# e2e/

Playwright through the real server and page, with the mock guesser and no keys. `npm run e2e`.

- Own ports (web 5299, server 3199); never reuses a running server. If the port is busy, another session is running e2e: wait.
- Speech is faked in the page (`fakeSpeech.ts`) or typed into the page's test input.
- `live/` is the check through real Deepgram and Claude (`npm run e2e:live`): needs keys and macOS `say`; the lead runs it.
