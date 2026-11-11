---
name: realtime-loop
description: Use when changing or debugging the live path of Tip of the Tongue (speech-to-text, stall detection, the speculative Claude guess, the gate, pop-up timing, Deepgram streaming, speaker labels) or when running live or replay evals. Holds the latency budget, the Deepgram facts we verified, and the traps already hit.
---

# Real-time loop

The product is judged on one moment: the user stalls mid-sentence and a word appears about 1.5 s later, or nothing appears. Every change to the live path must keep both halves: fast when stuck, silent otherwise.

## Latency budget (defaults in `server/src/config.ts`)

| Stage                                                                                     | Default                                            |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Deepgram endpointing                                                                      | 300 ms                                             |
| Speculative guess starts into a pause (`SPECULATE_AFTER_MS`, scaled up for slow speakers) | 300 ms                                             |
| Stall confirmed (`STUCK_PAUSE_MS`, adapted to the speaker's pace, 700 ms–6 s)             | 1500 ms                                            |
| Haiku guess, streamed                                                                     | about 0.8 s; aborted at 2.5 s (`GUESS_TIMEOUT_MS`) |
| Pop-up after the last word, in replay and live tests                                      | 1.4–1.7 s (p50)                                    |

The speculative guess is why the pop-up beats "pause + guess". Each unconfirmed pause costs one Claude call; the session caps calls at 60 a minute.

## Deepgram facts (checked live, Nova-3)

- `punctuate=false` on purpose: punctuation puts a full stop at a stall ("the place."), so the stall looks like a finished sentence. `smart_format` turns punctuation back on, so leave it off.
- `filler_words` exists only for English; it is requested only when the language is `en`.
- Keyterms change mid-stream with `{"type":"Configure","keyterms":[...]}`; the reply is `ConfigureSuccess` and words keep coming. Do not reconnect: a new stream renumbers speakers and the session forgets which voice is the user.
- Word times are audio time. Audio dropped before Deepgram is added back per stream (`stt/deepgram.ts`), so pauses are not inflated.
- Speaker labels (diarisation), the loudest voice at the mic and the "That's me" button decide "me": only the user's pauses can start a guess. Similar voices can be merged into one label. Without labels (browser speech, or replay without `--diarize`) the other person's stalls can trigger guesses.

## Rules that keep it quiet

- Gate: best candidate ≥ 0.6 confidence, 8 s cooldown, an offered word is blocked for 3 minutes, a word the user rejected ("the fork, no…") is never offered, a started word is never finished (stuttering).
- A turn gap between two voices is not a stall marker.
- Never add "say it aloud" or anything that speaks over the user.

## Measuring a change

1. Unit tests first (`npm test`); the detector and gate are pure.
2. Replay with the mock (no key, free): `npm run scenarios -w eval -- --split dev`. Diff the stall events before and after.
3. Real Claude (lead only, one run at a time): the same with `--guesser claude`, three runs. Report Wilson intervals; set bars before running; LLM results vary by about ±5 points.
4. Live audio (lead only, real time): `npm run scenarios:live -w eval -- --scenario s01` with `--noise cafe --snr 10` or `--rate 120`.

Before trusting a run, check the "failed or timed out" count per conversation and the words heard. A network drop shows up as many failed calls or very few words (one discarded run heard 153 words against about 2,200); throw that run away rather than tune on it. Never tune on `holdout`.

## Parked (do not re-open without new evidence)

Café noise costs accuracy (live: 83% clean, 58% at 10 dB), mostly as missed stalls. Other-speaker pop-ups without labels are run-to-run variance. Two tries, then park.
