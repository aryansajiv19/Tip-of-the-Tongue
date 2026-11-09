# Tip of the Tongue

A live word-finding companion. It listens to your conversation, learns the topic as you go (or from a short brief you give it before a meeting), and when you're mid-sentence and can't find a word, a small pop-up at the side of the screen asks "Is this the word you're looking for?" with a few options. It stays silent when you don't need it.

For anyone who loses a word mid-conversation: in meetings, on customer calls, or day to day, including people with aphasia.

Entry for the Hiya Voice AI Challenge — Accessibility track.

## Quick start

Works from a clean clone with **no API keys**. You need Node 22 and Chrome or Edge, because they support the browser speech recognition the app uses by default.

```bash
nvm use
npm install
npm run dev      # server on :3000, web on http://localhost:5173
```

**Desktop overlay (macOS menu-bar app):** `npm run app` starts the server and the web dev server and opens a small always-on-top overlay at the top right of the screen you are working on. It never takes focus, appears in screenshots and screen sharing, and has a tray icon (click to show or hide; right-click for Start/Pause, New conversation and Quit). Shortcuts: Cmd/Ctrl+\\ shows or hides it, Cmd/Ctrl+Enter asks for a word, Esc dismisses a suggestion, and Cmd/Ctrl+1, 2 or 3 picks the first, second or third one (the card shows which key is which). The desktop app needs `DEEPGRAM_API_KEY` in `.env` for speech: without it Electron has no speech service to fall back on, and the overlay says so. The tray icon is a placeholder (`app/assets/trayTemplate.png`). Open the drawer under the pill (the context button) to drop in a meeting document, tell it your name, role and the words you often need, and see or forget the words it has remembered from words you accepted before (words only, kept on this device). In a browser the same pill is fixed at the top right of the page; add `?debug=1` for developer tools (transcript, meeting brief, a no-mic test input, the debug panel).

Checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run e2e` (Playwright, through the no-mic test input). `npm run format` rewrites files with Prettier.

### Optional keys (`.env`, see `.env.example`)

- `ANTHROPIC_API_KEY` — real guessing with Claude. Without it, a mock guesser runs.

Speech-to-text: with `DEEPGRAM_API_KEY` set, the server streams your mic audio to Deepgram (Nova-3) and gets each word with real timings plus filler words ("um", "uh"). Without a key, the browser's Web Speech API is used, with approximate timings (Chrome and Edge only). If Deepgram fails mid-session, the app falls back to the browser automatically. A spoken cue is also planned; it needs echo handling first, because the microphone would hear the cue and count it as the user saying the word.

## Evaluate

```bash
npm run eval                                   # dev + holdout, mock guesser
npm run eval -- --split dev|holdout|all --guesser mock|claude
```

## Why voice

The moment that matters is mid-sentence, while talking to someone. Typing or searching breaks the conversation, and aphasia often affects reading and writing too.

## How it works

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Repository structure

```
server/  web/  eval/  data/  docs/
```

## Privacy

No audio is stored. With `DEEPGRAM_API_KEY` set, mic audio is streamed to Deepgram for transcription while you are listening, and is not kept by this app. Transcripts are kept in memory for the session only and sent only to the configured speech-to-text and AI providers.

Security notes for running it locally:

- The server accepts WebSocket connections only from browser origins in `ALLOWED_ORIGINS` (default: the Vite dev server on `localhost:5173` and `127.0.0.1:5173`). Without this check, any web page you visit could connect to the local server, read the guesses (which contain what you said) and spend your Claude key. Clients that send no `Origin` header, such as tests and the eval runner, are allowed.
- Incoming messages are limited to 64 KB, 300 words per event and 100 characters per word. Anything invalid is dropped and logged without the transcript text.
- If the guesser fails, the session stays silent instead of crashing.

## Limitations

- Tested only on our own written examples in the documented style of circumlocution, read as scripted text. **Not tested with people with aphasia**, and no claim of clinical benefit.
- Speech-to-text may mishear real aphasic speech.
- One microphone hears both sides of a conversation. With Deepgram, voices are told apart and only the user's own pauses start a guess; the user is taken to be whoever speaks first after Start, corrected when they accept a word or ask by hand. With browser speech there are no speaker labels, so the other person's pauses can trigger it.
- The 2023 study that found a model identified the intended word 91.67% of the time used text, not live speech. Measuring the live version is what the eval is for.

See [docs/EDGE-CASES.md](docs/EDGE-CASES.md) for the full list.

## License

MIT, see [LICENSE](LICENSE).
