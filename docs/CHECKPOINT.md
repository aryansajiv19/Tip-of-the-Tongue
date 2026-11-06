# Checkpoint

Single source of current status. Updated by the lead session when a branch lands or a decision changes.

_Last updated: 2026-11-06_

## Now

The core loop works end to end without keys. With a key, the real guesser gets the right word first on 94–95% of the dev stall items and 89% of the holdout items, with no false triggers on fluent speech. These are scripted text items, so read the caveats in `docs/write-up.md`. Next comes a live mic check by the owner, then pop-up design.

| Area                                                 | PR                  | Owner | State       |
| ---------------------------------------------------- | ------------------- | ----- | ----------- |
| Housekeeping, scaffold, CI matrix                    | #1–#3               | lead  | merged      |
| Guesser, Gate, AcceptanceTracker                     | #4                  | c1    | merged      |
| Web transcript, offer list, test input               | #5                  | 93    | merged      |
| TranscriptBuffer, StuckDetector                      | #6, #9              | 4c    | merged      |
| Pipeline wiring (session)                            | #7                  | lead  | merged      |
| Browser e2e (Playwright)                             | #8                  | 93    | merged      |
| Server hardening (origin allowlist, caps, fuzz)      | #10                 | 4c    | merged      |
| Eval runner + 56-item set                            | #11                 | c1    | merged      |
| Speech robustness (watchdog, flush, fake-speech e2e) | #12                 | 93    | in review   |
| Real eval numbers in write-up                        | `docs/eval-results` | c1    | in progress |
| Audit fixes (docs honesty, barrels)                  | `chore/audit-fixes` | 4c    | in progress |

## Decisions

- MIT licence, © Aryan Sajiv.
- Lead on Opus, workers on Sonnet; one worktree per worker (`~/tott-<area>`). Workers wait for "push"; the lead merges.
- Filler and describing cues need half the pause threshold of silence. After a stall marker, silence ends the description and triggers the guess.
- The gate checks the words said since the stall marker, so an answer said just before the pause suppresses the offer.
- The personal profile is opt-in (`PROFILE_PATH`).
- WebSocket accepts only allowlisted origins (`ALLOWED_ORIGINS`) and capped messages.
- Deepgram and the spoken cue are deferred (see PLAN decisions).

## Next

Owner: live mic check in Chrome, then fill in `ai.md`. Then pop-up design (small, calm, accessible) and the demo video.
