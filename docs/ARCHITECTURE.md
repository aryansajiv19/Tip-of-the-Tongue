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

| Event | Direction | Payload |
|---|---|---|
| `transcript.partial` / `transcript.final` | server → web | words with start/end ms |
| `stuck.detected` | server → web | reason, context window |
| `guess.offered` | server → web | candidates, confidence, latency ms |
| `guess.withdrawn` | server → web | reason (self-recovered, timeout) |
| `guess.accepted` / `guess.expired` | server → web | word, time to accept |

## Components

- **StuckDetector** — …
- **Guesser** — prompt design, output schema, timeout, mock …
- **Gate** — thresholds and why …
- **AcceptanceTracker** — …

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
