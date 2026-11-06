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

Checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

### Optional keys (`.env`, see `.env.example`)

- `DEEPGRAM_API_KEY` — better streaming speech-to-text with word timings.
- `ANTHROPIC_API_KEY` — real guessing with Claude. Without it, a mock guesser runs.

## Evaluate

```bash
npm run eval
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

## Limitations

Not yet tested with people with aphasia. See [docs/EDGE-CASES.md](docs/EDGE-CASES.md).

## License

MIT, see [LICENSE](LICENSE).
