# Checkpoint

Single source of current status. Updated by the lead session when a branch lands or a decision changes.

_Last updated: 2026-11-06_

## Now

The core loop works end to end without keys: browser speech or the test input, then the server detects a stall, guesses, gates and offers, then the word is accepted. Visual design comes after the eval and the e2e tests are in.

| Area                                   | Branch          | Owner     | State               |
| -------------------------------------- | --------------- | --------- | ------------------- |
| Housekeeping, scaffold, CI matrix      | —               | lead      | merged (#1–#3)      |
| Guesser, Gate, AcceptanceTracker       | —               | worker c1 | merged (#4)         |
| Web transcript, offer list, test input | —               | worker 93 | merged (#5)         |
| TranscriptBuffer, StuckDetector        | —               | worker 4c | merged (#6)         |
| Pipeline wiring (session)              | `feat/pipeline` | lead      | in review           |
| Browser e2e (Playwright)               | `test/e2e`      | worker 93 | waiting on pipeline |
| Eval runner + 50–60 item set           | `feat/eval`     | worker c1 | in progress         |

## Decisions

- MIT licence, © Aryan Sajiv.
- Spoken cue uses browser `speechSynthesis`; no ElevenLabs.
- Lead on Opus, workers on Sonnet; one worktree per worker (`~/tott-<area>`).
- Filler and describing cues need half the pause threshold of silence, so fluent speech never triggers.
- The personal profile is opt-in (`PROFILE_PATH`), so the fictional example doesn't leak into prompts.

## Next

Server hardening and fuzz tests, real Claude run of the eval (needs `ANTHROPIC_API_KEY`), pop-up design, Deepgram adapter.
