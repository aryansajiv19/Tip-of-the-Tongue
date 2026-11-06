# Architecture

> Skeleton — fill in as the code lands.

## Data flow

```
Browser mic
  -> STT (Deepgram stream, or Web Speech API fallback)
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

- **StuckDetector** (pure): takes recent words with timestamps and returns `{stuck, reason, contextWindow}`. It triggers on a pause over `STUCK_PAUSE_MS` (1500) after an incomplete phrase, on filler cues ("the thing", "what's it called"), or on describing patterns ("the thing you…", "the man who…"). A pause alone never triggers it.
- **Guesser**: sends Claude the context window, the meeting brief and the profile. It returns `{candidates: [{word, confidence}], abstain}`, validated with zod. If no answer arrives within `GUESS_TIMEOUT_MS` (2500), it abstains. A deterministic mock runs when there is no key.
- **Gate** (pure): offers only if the top confidence is ≥ `GATE_MIN_CONFIDENCE` (0.6), the word hasn't been said since, and the cooldown has passed.
- **AcceptanceTracker** (pure): an offered word spoken within N seconds counts as accepted; otherwise the offer expires.

## Key decisions

- No training: prompting + rules, measured by the eval set.
- Fast model by default for latency.
- Abstaining is a valid output.

## Limits

- Not tested with people with aphasia.
- Single speaker only.
- STT accuracy on atypical speech unknown.

## Where this could go

- Phone-call mode for people with aphasia who avoid calls (link to Hiya's call products).
- On-device STT for privacy; personal vocabulary learned over time with consent.
