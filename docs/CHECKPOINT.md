# Checkpoint

Single source of current status. Updated by the lead session when a branch lands or a decision changes.

_Last updated: 2026-11-06_

## Now
Phase: working base (core loop, keyless). Visual design comes after the loop works end to end.

| Area | Branch | Owner | State |
|---|---|---|---|
| Housekeeping (license, docs) | `chore/housekeeping` | lead | in review |
| Scaffold (workspaces, checks, events contract) | `feat/scaffold` | lead | next |
| Web transcript + plain offer list | `feat/web-transcript` | worker | after scaffold |
| TranscriptBuffer + StuckDetector | `feat/stuck-detector` | worker | after scaffold |
| Guesser + Gate + AcceptanceTracker | `feat/guesser-gate` | worker | after scaffold |
| Pipeline wiring | `feat/pipeline` | lead | after the three above |

## Decisions
- MIT licence, © Aryan Sajiv.
- Spoken cue uses browser `speechSynthesis`; no ElevenLabs.
- Lead on Opus, workers on Sonnet; one worktree per worker (`~/tott-<area>`).

## Next
Pop-up design, Deepgram adapter, eval runner and the 40–60 item set.
