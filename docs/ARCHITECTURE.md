# Architecture

## Data flow

```
Browser mic
  -> STT (browser Web Speech API, approximate word timings)
  -> server: TranscriptBuffer (recent words + timestamps)
  -> StuckDetector (pure rules)
  -> Guesser (Claude, JSON candidates + confidence; mock without key)
  -> Gate (confidence, self-recovery, cooldown)
  -> web UI: shows the word; AcceptanceTracker listens for it
```

## WebSocket events

Defined once in `server/src/events.ts`. Times are epoch ms.

| Event                                     | Direction    | Payload                                               |
| ----------------------------------------- | ------------ | ----------------------------------------------------- |
| `transcript.partial` / `transcript.final` | web → server | words with start/end ms (browser STT)                 |
| `session.brief`                           | web → server | optional meeting brief text                           |
| `stuck.detected`                          | server → web | reason (pause, filler, describing), context           |
| `guess.offered`                           | server → web | offer id, up to 3 candidates with confidence, latency |
| `guess.withdrawn`                         | server → web | offer id, reason (self-recovered, timeout)            |
| `guess.accepted` / `guess.expired`        | server → web | offer id; accepted word and time to accept            |

## Components

- **StuckDetector** (pure): takes recent words and the current time and returns `{stuck, reason, contextWindow, sinceMs}`. `sinceMs` is the end of the stall marker; words said after it may already be the answer. Text is lowercased and stripped of punctuation, so it works on plain Web Speech output. Rules, in order: (1) `pause`: silence longer than `STUCK_PAUSE_MS` (1500) after a phrase ending in a determiner, preposition, conjunction, modal or filler ("the", "to", "and", "um"); a pause after a complete clause never triggers. The remaining rules need at least half that silence and look only at the last 15 words said in the last 10 seconds. (2) `describing`: patterns such as "the thing you…", "the man who…", "the one that…", "the tool we use for…", "it's like a…", within the last 10 words. (3) `filler`: "the thing", "what's it called", "um/uh/er" or "you know" at the end, or a repeated "the the" at the end. (4) `describing` after a stall: a repeated determiner ("the… the") or a gap longer than the pause threshold earlier in the window, then silence once the description is finished. Saying "yes" or "sorry" after the marker cancels it.
  - Known false triggers: after that short silence, ordinary phrases such as "the man who called" or "it's like a dream" still count, and so does a repaired stall that never says "yes" or "sorry"; the Guesser and Gate are expected to abstain on them.
  - Known misses: a description with no marker and no cue phrase is caught only by a pause; "you know" in the middle of a sentence is ignored.
- **Guesser**: sends Claude the conversation so far (about the last 60 words), the phrase where the user got stuck, the meeting brief and the profile's personal words. It returns `{candidates: [{word, confidence}], abstain}`, parsed leniently (code fences and surrounding prose are tolerated) and validated with zod: confidence is clamped to 0..1, duplicates are removed, at most 3 candidates are kept. It abstains, never throws, on a timeout (`GUESS_TIMEOUT_MS`, 2500), an API error, a refusal or unparseable JSON. A deterministic mock runs when there is no key.
- **Gate** (pure): checks in this order. (1) The guesser abstained: silent. (2) The top word was already said since the stuck point: silent (`self-recovered`). (3) The last offer was less than the cooldown ago: silent. (4) Candidates already said or offered within the cooldown are dropped. (5) The best remaining word must reach `GATE_MIN_CONFIDENCE` (0.6) or the gate stays silent. Otherwise it offers up to 3 words; after the top one, only words at half the threshold or better. Spoken words are compared after lowercasing and stripping punctuation, possessives and simple plurals, so "chemist's" matches "chemist"; multi-word candidates match a run of spoken words.
- **AcceptanceTracker** (pure): only words that start after the offer count. If the user says any offered word (or phrase) within the acceptance window, the offer is accepted, with the time it took; if several are said, the earliest wins. With no match, the offer is pending until the window has passed, then it expires.
- **Session** (`server/src/session.ts`): one per WebSocket connection. It feeds transcript events into a `TranscriptBuffer` and polls every 200 ms, because a pause is silence and no event arrives when one passes. One stall triggers at most one guess: words already reacted to are not re-checked. While an offer is open, each check asks the AcceptanceTracker. A spoken candidate sends `guess.accepted`. Six or more new words without a candidate means the user has moved on, so it sends `guess.withdrawn` (`self-recovered`). The window running out (10 s) sends `guess.expired`. After an offer, the gate's cooldown is 8 s.
  - The gate is given the words said after `sinceMs` (the stall marker), not after the final silence, so a word the user has already said is never offered back.

## Key decisions

- No training: prompting + rules, measured by the eval set.
- Fast model by default for latency.
- Abstaining is a valid output.

## Limits

- Tested only on our own written, scripted examples; not tested with people with aphasia. No claim of clinical benefit.
- One mic hears both sides and the prototype cannot tell speakers apart; there is no speaker separation.
- Speech-to-text may mishear real aphasic speech; accuracy on atypical speech is unknown.
- Planned, not built: Deepgram streaming for real word timings, and a spoken cue (needs echo handling, because the mic would hear the cue and count it as the user saying the word).

## Where this could go

- Phone-call mode for people with aphasia who avoid calls (link to Hiya's call products).
- On-device STT for privacy; personal vocabulary learned over time with consent.

## Evaluation

`npm run eval -- --split dev|holdout|all --guesser mock|claude` runs the hand-written items in `data/eval/circumlocutions.json` through the real modules. Each utterance becomes timed words: 300 ms apart, with a 2000 ms pause wherever the text has "...". The runner replays the live server by calling `detectStuck` every 200 ms from the first word to 2 s after the last; "detected" means it fired at least once. Only then does the item go to the guesser (using the last trigger point, with the words heard by then) and the gate (the example profile and the item's meeting brief, if any, are passed in). Items are written by us in the documented style of circumlocution and never copied from a corpus. 11 of the 56 items (9 of the 41 stall items) are `holdout` and are never used for tuning.

- Stall items (objects, places, people, meeting terms, personal words): detector hit rate; then top-1 and top-3 (is an acceptable word first, or among the first three; a stall the detector misses counts as a miss), abstain rate, offered rate, and false-offer rate (of the offers made, the share where no offered word is acceptable).
- Silent items (`not_stuck` fluent speech, `self_recovered` where the user says the word after stalling): the share where the detector fired and the share where the app offered anyway. Any offer here is wrong.
- Latency of the guess, p50 and p95.

Results are written to `eval-results/` (gitignored). The `mock` guesser only covers a few dev items, so its numbers show the pipeline works, not how good Claude is. Spoken input, real aphasic speech and speech-to-text errors are not covered.
