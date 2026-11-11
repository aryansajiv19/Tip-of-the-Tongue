# Tip of the Tongue

**Real-time help when a word escapes you.** You stall mid-sentence, and about 1.5 s later the word you were reaching for appears in a small overlay. The rest of the time it stays quiet.

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

It's for anyone who loses words mid-conversation, in meetings, interviews, calls or day to day. That includes people with anomic aphasia, brain fog or a stammer, older speakers, and people speaking a second language.

Entry for the **Hiya Voice AI Challenge, Real-time Assistance track**.

## Try it

You need Node 22 (`nvm use`) and a Mac for the desktop overlay. On Windows or Linux, use the web version in Chrome or Edge.

1. `npm install`
2. Copy `.env.example` to `.env` and add `ANTHROPIC_API_KEY` (word guessing with Claude Haiku) and `DEEPGRAM_API_KEY` (streaming speech-to-text with word timings and speaker labels; the desktop app needs it).
3. `npm run demo`, allow the microphone, press play, and pause mid-sentence: "I need to book the… the thing you fly in". The first launch downloads the Electron runtime once (about 30 s).

No keys? `npm run dev` runs the web version at http://localhost:5173 with a mock guesser and the browser's speech recognition. Other settings are in `.env.example`.

`npm run dist` builds unsigned `.dmg` installers in `release/`. The installed app asks for your own keys on first launch and keeps them encrypted in the macOS Keychain; open it the first time with right-click › Open.

## Features

**Notices when you're stuck**

- A pause, a filler, a cue phrase ("what's it called") or a description ("the place where you get medicine"). The pause it waits for adapts to your pace.
- Stays quiet during stutters and blocks, never finishes a word you have started, and never offers a word you just rejected ("the fork, no, the…").
- Only your stalls count, even with several people on a call: Deepgram labels the voices and it follows yours as the loudest at your microphone. If it picks the wrong one, press **That's me** right after you speak.

**Offers the right word, fast**

- Guessing starts while you are still pausing; the pop-up usually appears 1.4–1.7 s after your last word, with up to three words. Say one, click it, or press ⌘1/⌘2/⌘3.
- It prefers the specific word and keeps phrases whole ("phone cable", "car park"). When it finds nothing it shows a quiet "…" for a moment.
- Context from meeting notes (PDF, Markdown or text), "About you" and words you accepted before.
- **Skills**: topic packs (Medical visit, Job interview, Software & tech, Money & finance, Everyday errands) or your own, up to 5 at once. The recogniser listens for the topic's words and the guesser knows the field.
- Optional **Show how to continue** (off by default): a few muted words after the main word ("pharmacy to pick up my tablets"). Picking it still means the word alone.

**Fits how you want to be helped**

- First sound only, the whole word, or only when you ask; from Calm to Eager.
- English, Spanish, French, German, Hindi or mixed.
- Large text, light or dark, keyboard and screen-reader friendly, reduced motion respected.

**Stays out of the way**

- An always-on-top macOS overlay with a menu-bar icon. It never takes focus, can be dragged anywhere, and shows in screen shares.
- Settings › Privacy lists everything kept on your device, with Forget everything.
- Recovers from network drops, sleep and mic changes, and warns about a muted mic.

|                                                                                                                        |                                                                                                                             |                                                                                                                                    |
| :--------------------------------------------------------------------------------------------------------------------: | :-------------------------------------------------------------------------------------------------------------------------: | :--------------------------------------------------------------------------------------------------------------------------------: |
| <img src="docs/assets/state-listening.png" width="260" alt="Listening: the pill with a live level meter"><br>Listening |            <img src="docs/assets/state-thinking.png" width="260" alt="Thinking: it noticed a pause"><br>Thinking            |       <img src="docs/assets/state-suggestion.png" width="260" alt="Suggestion: the word and two alternatives"><br>Suggestion       |
|   <img src="docs/assets/state-accepted.png" width="260" alt="Accepted: the word you said is confirmed"><br>Accepted    | <img src="docs/assets/state-first-run.png" width="260" alt="First run: how should I help when you are stuck?"><br>First run | <img src="docs/assets/state-settings.png" width="180" alt="Settings: help level, speed, language, text size, privacy"><br>Settings |

Shortcuts: ⌘\\ show or hide, ⌘↵ ask now, ⌘1/2/3 pick, Esc dismiss, ⌘⇧N new conversation (Ctrl on Windows and Linux). All settings are in the [user guide](docs/USER-GUIDE.md).

## How it works

```
mic ─▶ speech-to-text ─▶ stall detector ─▶ Claude guesser ─▶ gate ─▶ overlay
       (Deepgram or       (pause, fillers,    (context, profile,  (confidence,
        browser)           pace, stutter,      skills; streamed,   repeats,
                           whose voice)        abstains if unsure) cooldown)
```

The server holds one session per connection. It keeps the transcript in memory, decides when you are stuck, asks Claude for candidates, and offers them only when confident. Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Evidence

All numbers come from scripted conversations we wrote, not real users; LLM results vary between runs. 95% Wilson intervals in brackets.

| Test                                                                | Result                                                                                                                                                                 |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 20 conversations (dev split), real Claude, three runs               | 93–96% of stalls get the right word, 2–4 wrong of 71; 0–1 pop-ups in 165 fluent lines.                                                                                 |
| 8 held-back conversations, never tuned on, one run                  | 94% (17/18) [74–99%], 1 wrong, 1/65 fluent pop-ups.                                                                                                                    |
| Live audio, one sales call in six voices (real Deepgram and Claude) | 20/24 stalls, 1 wrong, 1/66 fluent pop-ups. With café noise 10 dB below: 14/24, 2 wrong.                                                                               |
| Live audio, 3–4 voices with others on a call, 66 stalls             | 85% correct strictly, about 92% counting the right word that arrived as the next speaker began. Voice pick 14/14; 0/44 fluent pop-ups; 8/164 pop-ups on others' lines. |
| Mixing in Spanish (two runs)                                        | 4/4 and 3/4; the Spanish word is never offered.                                                                                                                        |

The live tests use synthetic macOS voices reading scripts. Methods, the hard and holdout sets and all caveats: [docs/write-up.md](docs/write-up.md). Research on how people speak: [docs/RESEARCH.md](docs/RESEARCH.md).

## Development

```bash
npm run lint && npm run typecheck && npm test && npm run build   # required before a PR
npm run e2e                                                      # Playwright UI tests
npm run eval -- --set hard --split dev --guesser claude          # word-guess evaluation
npm run scenarios -w eval -- --guesser claude --split dev       # whole-conversation replay
npm run bench                                                    # standard suite vs the last run (--live adds real speech)
```

`server/` pipeline, `web/` overlay, `app/` Electron shell, `eval/` evaluation, `e2e/` Playwright, `data/` eval sets and skill packs, `docs/` architecture, write-up, status. CI runs lint, typecheck, unit tests and the build on Linux, macOS and Windows (Node 22 and 24), plus the end-to-end tests.

## Privacy and security

- No audio is stored. With Deepgram, audio is streamed for transcription only while you are listening.
- Transcripts live in memory for the session and go only to the speech-to-text and AI providers. Info-level logs never contain your words.
- The local server accepts WebSocket connections only from `ALLOWED_ORIGINS`; with `TOTT_TOKEN` set a socket must also carry the token (compared in constant time, never logged). Message sizes are capped.

## Limitations

- **Not tested with people with aphasia**, and we make no clinical claim.
- Speech-to-text can mishear atypical speech; severe dysarthria is a weak spot for every recogniser.
- Similar voices can be merged into one by Deepgram's speaker labels. With browser speech there are no labels, so other people's pauses can trigger a guess.
- Background noise lowers how often it catches a stall (83% clean, 58% with café noise). Use a headset; on laptop speakers others' voices leak into the mic.
- Skills showed no measurable accuracy gain in our tests, though they made fewer wrong offers. Show how to continue costs a few points of accuracy, which is why it is off by default.
- Only the Spanish code-switching case is measured. macOS only for the desktop app, and it is not signed yet.

More in [docs/EDGE-CASES.md](docs/EDGE-CASES.md).

## Licence

MIT © Aryan Sajiv. See [LICENSE](LICENSE). How AI was used: [ai.md](ai.md).
