# Checkpoint

Single source of current status. Updated by the lead session when a branch lands or a decision changes.

_Last updated: 2026-11-06_

## Now

Goal: a working MVP with a nice UI by 2026-11-07.

The full loop works live, and every stage in it is real:

- **Speech:** Deepgram Nova-3 streaming with filler words, falling back to the browser.
- **Stall detection:** any hesitation pause counts, plus cue phrases.
- **Guessing:** a speculative Claude Haiku call that starts 300 ms into a pause.
- **Gate:** the confidence threshold.
- **Pop-up:** the frosted card.

Live test through real Deepgram and Claude, with a fake mic playing a synthesised voice: the pop-up appears 1.0–1.5 s after speech ends.

| Area                                       | PR            | Owner    | State                       |
| ------------------------------------------ | ------------- | -------- | --------------------------- |
| Core loop, eval, hardening, e2e            | #1–#21        | all      | merged                      |
| Real-Chrome speech fix (chunked results)   | #22           | 93       | merged                      |
| Guesser streaming + thinking-pause items   | #23           | c1       | merged                      |
| Deepgram server + web, punctuation off     | #24, #26, #27 | lead, 93 | merged                      |
| Speculative guessing, any-pause rule       | #25           | 4c       | merged                      |
| Hard set + model comparison (Haiku kept)   | #28           | c1       | merged                      |
| Frosted pop-up, click to accept            | #29           | 4c       | merged                      |
| Long-brief glossary (≤ 50k chars)          | #30           | c1       | merged                      |
| Page design, sensitivity setting           | #31           | 4c       | merged                      |
| Voice activity, hum, manual trigger        | #32           | 93       | resolving conflicts         |
| Deepgram keyterms + debug panel            | #33           | c1       | CI test failure being fixed |
| Dynamic e2e ports, wire "What's the word?" | next          | 4c       | after #32                   |

## Decisions

- MIT licence, © Aryan Sajiv.
- Lead on Opus, workers on Sonnet. One worktree per worker. Workers wait for "push"; the lead merges only after CI is green.
- Haiku is the default guesser. On the hard set, Sonnet was +2 items at about twice the latency, and Opus was no better and slower. Sonnet is available through `ANTHROPIC_MODEL`.
- Any mid-sentence pause is a candidate stall. The guesser decides whether the speaker is searching: 0/10 offers on thinking-pause items.
- Deepgram punctuation is off, because it puts full stops at pauses and would hide stalls.
- The personal profile is opt-in. Without it, personal words go confidently wrong (0/4, with 3 wrong offers).
- Tests must be hard and realistic. No over-engineering. No stale code.

## Next

PDF "Prepare for a meeting" upload (it builds on the glossary). The owner's live checks then tune the voice-activity thresholds and sensitivity.
