# Demo runbook

For the live demo on a video call. Keep this open on a second screen.

## 30 minutes before

1. Quit anything that uses the microphone, and close extra Chrome tabs.
2. In `~/voice-airlock-hiya` (branch `main` or `demo-check`): `nvm use`, then `npm run demo`.
3. Allow the microphone. The pill appears top right. Press play.
4. Say test line 1 below once. If "plane" appears, you are ready. Press ⌘⇧N to start a clean conversation.
5. Open `docs/assets/demo.mp4` in QuickTime and leave it paused, as the backup.
6. On the call, share the screen (not one window), so the overlay shows.
7. Wear headphones. Then the mic hears only you, so the other people's voices can't be taken for yours. Without them, press **That's me** after your first sentence.

## How to say the lines

- Keep the first "…" short (under a second) and make the long pause at the end. A long pause after "book the" can get "appointment" before you have described anything.
- After the description, stay silent for about 2 s. If the others talk straight away, the card can come late or be counted against their line.
- Say "what's his name" with nothing about cars or places just before it, or it may guess from that context.

## Demo lines (in this order)

| Say or do                                                                                      | What should happen                                        |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| "I need to book the… the thing you fly in" (then pause)                                        | About 1.5 s later a card offers **plane**                 |
| Talk normally for 20 s about your weekend                                                      | Nothing appears. Staying quiet is the point               |
| "I spoke to… um… what's his name"                                                              | "…" or nothing: it can't know a name, so it doesn't guess |
| Mid-sentence, press **⌘↵**                                                                     | A suggestion at once, without waiting for a pause         |
| Settings › Skills › Medical visit, then: "the doctor gave me a… the thing you puff for asthma" | **inhaler**                                               |
| "Pass me the fork, no, the…"                                                                   | Never offers "fork" (a word you rejected)                 |
| ⌘1 picks the first word, Esc dismisses                                                         | The card goes away                                        |
| ⌘\ hides and shows the overlay; ⌘⇧N starts a new conversation                                  | As described                                              |

Talking points: it is silent unless it is confident, it never speaks aloud, no audio is stored, and the transcript lives only in memory.

## If something fails

| Symptom                                                     | Do this                                                                                                                                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Card says the Anthropic key is wrong or the service is busy | It backs off and retries by itself. If it lasts more than 30 s, switch to the backup video.                                                                              |
| Nothing is heard (Deepgram down, or "add a Deepgram key")   | The desktop app needs Deepgram. Quit it (tray › Quit), run `npm run dev`, open http://localhost:5173 in **Chrome**: it uses Chrome's own speech recognition plus Claude. |
| Both APIs down, or no network                               | `npm run dev` with the keys commented out in `.env` runs the mock guesser. Say "I'm going to the… the place where planes go": it offers **airport**. Say it is a mock.   |
| The overlay is frozen or gone                               | ⌘\ first. Still gone: quit from the tray, then the quick restart below.                                                                                                  |
| Anything else, or less than 2 minutes to recover            | Play `docs/assets/demo.mp4` (70 s, with sound) and talk over it.                                                                                                         |

## Quick restart (about 15 s)

```bash
pkill -f "electron \." ; pkill -f "vite" ; pkill -f "tsx.*server"   # clears stuck processes
cd ~/voice-airlock-hiya && npm run demo
```

If it says a port is in use: `lsof -ti :3000 -ti :5173 | xargs kill`, then `npm run demo` again.

## After

Stop the app (tray › Quit). If you set `TRACE_FILE` in `.env` for testing, clear it and delete the trace file: it contains what was said.
