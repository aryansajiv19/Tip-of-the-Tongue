# Tip of the Tongue

**A live word-finding companion.** When a word escapes you mid-sentence, it offers it in about a second and a half, and stays silent the rest of the time.

<p align="center">
  <a href="docs/assets/demo.mp4"><img src="docs/assets/demo.gif" width="760" alt="Demo: the speaker stalls on 'the thing you fly in', the overlay offers 'plane', and nothing pops up during fluent speech"></a>
  <br>
  <sub><a href="docs/assets/demo.mp4">Watch the 25-second demo with sound</a></sub>
</p>

<p align="center">
  <a href="#try-it">Try it</a> ·
  <a href="#features">Features</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#evidence">Evidence</a> ·
  <a href="docs/USER-GUIDE.md">User guide</a> ·
  <a href="#limitations">Limitations</a>
</p>

It listens to your conversation. When you stall on a word, a small overlay offers up to three likely words, or just the first sound if you prefer. It stays quiet while you speak fluently, while you are still finding the word yourself, and while someone else is talking.

It's for anyone who loses words mid-conversation, in meetings, interviews, calls or day to day. That includes people with anomic aphasia, brain fog or a stammer, older speakers, and people speaking a second language.

Entry for the **Hiya Voice AI Challenge, Accessibility track**.

## Try it

You need Node 22 (`nvm use`) and a Mac for the desktop overlay. On Windows or Linux, use the web version (`npm run dev`) in Chrome or Edge.

1. `npm install`
2. Copy `.env.example` to `.env` and add `ANTHROPIC_API_KEY` and `DEEPGRAM_API_KEY`.
3. `npm run demo`, allow the microphone, press play, and pause mid-sentence: "I need to book the… the thing you fly in". The first launch downloads the Electron runtime once (about 30 s).

No keys? `npm run dev` runs the web version from a clean clone with a mock guesser and the browser's speech recognition (Chrome or Edge) at http://localhost:5173.

| Variable            | What it enables                                                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | Real word guessing with Claude (default model `claude-haiku-5-5`). Without it, a mock guesser runs.                                                   |
| `DEEPGRAM_API_KEY`  | Streaming speech-to-text (Nova-3) with word timings, filler words and speaker labels. Without it, browser speech is used. The desktop app needs this. |

Optional settings are in `.env.example`: a personal profile file, sensitivity and the allowed browser origins.

## Features

**Notices when you're stuck**

- Triggers on a pause, a filler, a cue phrase ("what's it called") or a description of the thing ("the place where you get medicine").
- The pause it waits for adapts to your pace. It stays quiet during stutters and blocks and never finishes a word you have started.
- It never offers a word you just rejected ("the fork, no, the…"), and only your own stalls count: Deepgram tells the voices apart.

**Offers the right word, fast**

- Guessing starts while you are still pausing; the pop-up typically appears 1.4–1.7 s after your last word.
- Optional, off by default (Settings › Show how to continue): when the next words are strongly implied, the offer carries 2–4 of them after the word ("pharmacy to collect my tablets"), to help you back into the flow; accepting still means the word alone.
- It prefers the specific word and keeps phrases whole ("phone cable", "car park"). Say the word, click it, or press ⌘1/⌘2/⌘3.
- When it cannot find the word it says so with a quiet "…" for a moment, instead of just vanishing.
- Meeting notes (PDF, Markdown or text), "About you" and words you have accepted before give it context. Words are remembered on this device only, never transcripts.
- Skills: switch on a topic pack (Medical visit, Job interview, Software & tech, Money & finance, Everyday errands) or write your own under Settings › Skills (up to 5 on at once, kept on this device), and the speech recogniser listens for that field's words and the guesser knows the topic. Packs live in `data/skills/`.

**Fits how you want to be helped**

- First sound only, the whole word, or only when you ask; and how quickly it offers words, from Calm to Eager.
- English, Spanish, French, German, Hindi or mixed. With English selected, a foreign word in your sentence gets its English word.
- Large text, light or dark following your system, keyboard and screen-reader friendly, reduced motion respected.

**Stays out of the way**

- An always-on-top macOS overlay with a menu-bar icon. It never takes focus, can be dragged anywhere, and stays visible when you share your screen.
- Settings › Privacy lists everything kept on your device, with Forget everything.
- It reconnects after a network drop or sleep, recovers when a mic is unplugged or switched, and warns about a muted or very quiet mic.

<p align="center"><img src="docs/assets/state-listening.png" width="520" alt="Listening: the pill with a live level meter"><br><b>Listening</b>: the pill with a live level meter</p>

<p align="center"><img src="docs/assets/state-thinking.png" width="520" alt="Thinking: it noticed a pause and is finding the word"><br><b>Thinking</b>: it noticed a pause and is finding the word</p>

<p align="center"><img src="docs/assets/state-suggestion.png" width="520" alt="Suggestion: the word, two alternatives and their shortcuts"><br><b>Suggestion</b>: the word, two alternatives and their shortcuts</p>

<p align="center"><img src="docs/assets/state-accepted.png" width="520" alt="Accepted: the word you said is confirmed"><br><b>Accepted</b>: the word you said is confirmed</p>

<p align="center"><img src="docs/assets/state-settings.png" width="340" alt="Settings: help level, speed, language, text size, privacy"><br><b>Settings</b>: help level, speed, language, text size, privacy</p>

<p align="center"><img src="docs/assets/state-first-run.png" width="520" alt="First run: how should I help when you are stuck?"><br><b>First run</b>: how should I help when you are stuck?</p>

### Keyboard shortcuts (desktop overlay)

| Keys         | Action                                                                       |
| ------------ | ---------------------------------------------------------------------------- |
| ⌘\\          | Show or hide the overlay                                                     |
| ⌘↵           | Ask for a word now                                                           |
| ⌘1 / ⌘2 / ⌘3 | Pick a suggestion (taken from other apps only while a suggestion is showing) |
| Esc          | Dismiss a suggestion                                                         |
| ⌘⇧N          | New conversation (clears everything heard)                                   |

On Windows and Linux use Ctrl instead of ⌘. In the browser, add `?debug=1` for developer tools.

### Build the installer (optional)

`npm run dist` builds `.dmg` installers in `release/` (Apple silicon and Intel). The installed app asks for your own keys on first launch and stores them encrypted in the macOS Keychain. It is unsigned, so open it the first time with right-click › Open.

## How it works

```
mic ─▶ speech-to-text ─▶ stall detector ─▶ Claude guesser ─▶ gate ─▶ overlay
       (Deepgram or       (pause, fillers,    (context, profile,  (confidence,
        browser)           pace, stutter,      document; streamed, repeats,
                           self-corrections)   abstains if unsure) cooldown)
```

The server holds one session per connection. It keeps the transcript in memory, decides when you are stuck, asks Claude for candidates, and offers them only when confident. A word you then say is counted as accepted. Details are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Evidence

All numbers come from our own scripted conversations, which are not real users. LLM results vary between runs. 95% Wilson intervals are in brackets.

| Test                                                        | Result                                                                                         |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 20 whole conversations (dev split), real Claude, three runs | 93–96% of stalls get the right word, 2–4 wrong of 71. 0–1 pop-ups in 165 fluent lines.         |
| 8 held-back conversations, never tuned on, one run          | 94% (17/18) [74–99%], 1 wrong, 1/65 fluent pop-ups.                                            |
| Slow, breathy and self-correcting speakers                  | Right word on 9–11 of 11 stalls. A rejected word is never offered.                             |
| Live audio (macOS voices through real Deepgram and Claude)  | One sales call in six voices: 20/24 stalls, 1 wrong, 1/66 fluent pop-ups.                      |
| Same, with café noise 10 dB below the speech                | 14/24 stalls, 2 wrong, 0/66 fluent pop-ups. Noise mostly costs missed stalls, not wrong words. |
| Mixing in Spanish (language-aware prompt, two runs)         | 4/4 and 3/4, and the Spanish word is never offered (1/4 before, offering "factura").           |

Hard and holdout sets, the methods and the caveats are in [docs/write-up.md](docs/write-up.md). Research on how people speak, and the design choices it led to, is in [docs/RESEARCH.md](docs/RESEARCH.md).

## Development

```bash
npm run lint && npm run typecheck && npm test && npm run build   # required before a PR
npm run e2e                                                      # Playwright UI tests
npm run eval -- --set hard --split dev --guesser claude          # word-guess evaluation
npm run eval -- --set specialist --skills match --guesser claude # topic packs on/off/wrong: --skills match|off|wrong
npm run scenarios -w eval -- --guesser claude --split dev       # whole-conversation replay
```

```
server/   Fastify + WebSocket pipeline (session, stall detector, guesser, gate, Deepgram)
web/      React overlay (pill, suggestion card, prep drawer, settings)
app/      Electron shell for the desktop overlay
eval/     Offline evaluation, scenario replay, live-audio harness
e2e/      Playwright tests
data/     Evaluation sets and an example profile
docs/     Architecture, research, edge cases, write-up, status
```

CI runs lint, typecheck, unit tests and the build on Linux, macOS and Windows with Node 22 and 24, plus the end-to-end tests.

## Privacy and security

- No audio is stored. With Deepgram, audio is streamed for transcription only while you are listening.
- Transcripts live in memory for the session and go only to the configured speech-to-text and AI providers. Info-level logs never contain your words.
- The local server accepts WebSocket connections only from `ALLOWED_ORIGINS` (and from its own port when `WEB_DIST` is set). With `TOTT_TOKEN` set, a socket must also open with `?token=<it>` or it is closed with code 4401; the token is compared in constant time and never logged. Message size, word count and word length are capped.

## Limitations

- **Not tested with people with aphasia**, and we make no clinical claim. The evidence comes from scripted conversations and synthetic voices.
- Speech-to-text can mishear atypical speech. Severe dysarthria is a known weak spot for every recogniser.
- With browser speech there are no speaker labels, so the other person's pauses can trigger a guess.
- Background noise lowers how often it catches a stall (83% clean, 58% with café noise in the live test). Use a headset in noisy places; on laptop speakers the other person's voice can also leak into the microphone.
- The language setting covers English, Spanish, French, German and Hindi, plus a mixed mode. Only the Spanish code-switching case is measured.
- macOS only for the desktop app, and it is not signed yet.

See [docs/EDGE-CASES.md](docs/EDGE-CASES.md) for the full list.

## Licence

MIT © Aryan Sajiv. See [LICENSE](LICENSE). How AI was used to build this project is in [ai.md](ai.md).
