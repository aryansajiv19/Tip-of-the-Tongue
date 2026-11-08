# Checkpoint

Single source of current status. Updated by the lead session when a branch lands or a decision changes.

_Last updated: 2026-11-08_

## Now

Goal: a working MVP with a nice UI. The full loop runs live: Deepgram Nova-3 (keyterms from the profile and brief) or browser speech → stall detector (any pause, cue phrases, sound signals) → Haiku guess started 300 ms into a pause → gate → pop-up. A guess takes about 0.8 s; in the scenario tests the pop-up appears about 1.4 s after the last word.

| Area                                                | PR            | Owner    | State       |
| --------------------------------------------------- | ------------- | -------- | ----------- |
| Core loop, eval, hardening, e2e                     | #1–#21        | all      | merged      |
| Chrome chunked-speech fix                           | #22           | 93       | merged      |
| Guesser streaming, thinking-pause items             | #23           | c1       | merged      |
| Deepgram server + web, punctuation off              | #24, #26, #27 | lead, 93 | merged      |
| Speculative guessing, any-pause rule                | #25           | 4c       | merged      |
| Hard set, model comparison (Haiku kept)             | #28           | c1       | merged      |
| Frosted pop-up, click to accept                     | #29           | 4c       | merged      |
| Long-brief glossary (≤ 50k chars)                   | #30           | c1       | merged      |
| Page design, sensitivity setting                    | #31           | 4c       | merged      |
| Sound signals, hum cue, manual trigger              | #32           | 93       | merged      |
| Deepgram keyterms, debug panel                      | #33           | c1       | merged      |
| Checkpoint refresh, design tokens, `ai.md`          | #34–#36       | lead, 4c | merged      |
| Scenario suite of whole conversations, fixes        | #37           | c1       | merged      |
| Context hygiene: docs, dead code                    | this PR       | c1       | in review   |
| Desktop overlay shell (`app/`)                      | next          | 4c       | in progress |
| Overlay suggestion card                             | next          | 93       | in progress |
| Speaker separation (Deepgram diarisation), measured | next          | c1       | after this  |

## Decisions

- MIT licence, © Aryan Sajiv. Lead on Opus, workers on Sonnet, one worktree each; workers wait for "push" unless pre-approved; the lead merges only after CI is green.
- Haiku is the default guesser. On the hard set Sonnet was a few items better (not clearly) at about twice the latency; Opus no better. Sonnet via `ANTHROPIC_MODEL`.
- Any mid-sentence pause is a candidate stall; the guesser decides whether the speaker is searching. Pauses are marked "…" between words in what it reads (never at the end). An offered word stays off the list for 3 minutes.
- Deepgram punctuation is off, because it puts full stops at pauses and would hide stalls.
- The profile is opt-in; without it personal words go confidently wrong (0/4, 3 wrong offers). The brief helped little on guessable items.
- Evidence rules: never tune on holdout; intervals and caveats with every number; LLM results vary between runs.
- API keys stay in the lead's checkout; workers get Claude runs from the lead.
- Tests must be hard and realistic. No over-engineering. No stale code.

## Next

Measure speaker separation (the main remaining limit), PDF "Prepare for a meeting" upload (builds on the glossary), then the owner's live checks to tune the voice-activity thresholds and sensitivity.
