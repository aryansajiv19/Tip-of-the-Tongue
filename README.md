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

Checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run e2e` (Playwright, through the no-mic test input). `npm run format` rewrites files with Prettier.

### Optional keys (`.env`, see `.env.example`)

- `ANTHROPIC_API_KEY` — real guessing with Claude. Without it, a mock guesser runs.

Speech-to-text is the browser's Web Speech API, with approximate word timings. Planned: Deepgram streaming for real word timings. A spoken cue is also planned; it needs echo handling first, because the microphone would hear the cue and count it as the user saying the word.

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

No audio is stored. Transcripts are kept in memory for the session only and sent only to the configured speech-to-text and AI providers.

Security notes for running it locally:

- The server accepts WebSocket connections only from browser origins in `ALLOWED_ORIGINS` (default: the Vite dev server on `localhost:5173` and `127.0.0.1:5173`). Without this check, any web page you visit could connect to the local server, read the guesses (which contain what you said) and spend your Claude key. Clients that send no `Origin` header, such as tests and the eval runner, are allowed.
- Incoming messages are limited to 64 KB, 300 words per event and 100 characters per word. Anything invalid is dropped and logged without the transcript text.
- If the guesser fails, the session stays silent instead of crashing.

## Limitations

- Tested only on our own written examples in the documented style of circumlocution, read as scripted text. **Not tested with people with aphasia**, and no claim of clinical benefit.
- Speech-to-text may mishear real aphasic speech.
- One microphone hears both sides of a conversation, and the prototype cannot tell speakers apart. There is no speaker separation, so the other person's pauses and words can affect it.
- The 2023 study that found a model identified the intended word 91.67% of the time used text, not live speech. Measuring the live version is what the eval is for.

See [docs/EDGE-CASES.md](docs/EDGE-CASES.md) for the full list.

## License

MIT, see [LICENSE](LICENSE).
