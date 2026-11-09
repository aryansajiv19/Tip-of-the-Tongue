# Checkpoint

Single source of current status. Updated by the lead session when a branch lands or a decision changes.

_Last updated: 2026-11-09, end of day_

## Now

Goal: a working MVP with a nice UI. The full loop runs live: Deepgram Nova-3 (keyterms from the profile and brief) or browser speech → stall detector (any pause, cue phrases, sound signals) → Haiku guess started 300 ms into a pause → gate → pop-up. A guess takes about 0.8 s; in the scenario tests the pop-up appears about 1.4 s after the last word.

| Area                                                                                          | PR                 | Owner    | State                                                |
| --------------------------------------------------------------------------------------------- | ------------------ | -------- | ---------------------------------------------------- |
| Core loop, eval, hardening, e2e                                                               | #1–#21             | all      | merged                                               |
| Chrome chunked-speech fix                                                                     | #22                | 93       | merged                                               |
| Guesser streaming, thinking-pause items                                                       | #23                | c1       | merged                                               |
| Deepgram server + web, punctuation off                                                        | #24, #26, #27      | lead, 93 | merged                                               |
| Speculative guessing, any-pause rule                                                          | #25                | 4c       | merged                                               |
| Hard set, model comparison (Haiku kept)                                                       | #28                | c1       | merged                                               |
| Frosted pop-up, click to accept                                                               | #29                | 4c       | merged                                               |
| Long-brief glossary (≤ 50k chars)                                                             | #30                | c1       | merged                                               |
| Page design, sensitivity setting                                                              | #31                | 4c       | merged                                               |
| Sound signals, hum cue, manual trigger                                                        | #32                | 93       | merged                                               |
| Deepgram keyterms, debug panel                                                                | #33                | c1       | merged                                               |
| Checkpoint refresh, design tokens, `ai.md`                                                    | #34–#36            | lead, 4c | merged                                               |
| Scenario suite of whole conversations, fixes                                                  | #37                | c1       | merged                                               |
| Context hygiene: docs, dead code                                                              | #38                | c1       | merged                                               |
| Overlay pill, Electron shell, card, settings                                                  | #39, #41           | 4c, 93   | merged                                               |
| Speaker labels; re-pick on new stream                                                         | #40, #42           | c1       | merged                                               |
| Meeting-prep drawer (PDF/md/txt), source                                                      | #43                | 4c       | merged                                               |
| Live-audio scenarios; pop-up counted for the line in progress                                 | #46                | c1       | merged                                               |
| First-run UX, pill labels, mic-denied Retry, bigger overlay (420 px)                          | #47, #49, #53      | 4c       | merged                                               |
| Contrast, Esc in the desktop app, screenshots of every state                                  | #45, #61           | 93       | merged                                               |
| About you + remembered words (`session.profile`)                                              | #48                | 4c       | merged                                               |
| Stray voice label; repeat rule; flaky-test fixes                                              | #51, #52           | c1       | merged                                               |
| Desktop window size, research doc, code map, shared-machine rules                             | #50, #54, #57, #62 | 93, lead | merged                                               |
| ⌘1/2/3 pick (one IPC channel with Esc)                                                        | #56                | 4c       | merged                                               |
| Runtime robustness: Deepgram retry/ping, mic loss, sleep, quiet input; desktop no-key message | #58, #59, #63      | 93       | merged                                               |
| Adaptive pause, stutter-aware detection, self-corrections, 4 scenarios                        | #64                | c1       | merged                                               |
| Help level (first sound / word / only when I ask)                                             | #60                | 4c       | merged                                               |
| Keyterm updates without reconnecting (Deepgram `Configure`, checked live)                     | local `051babe`    | 75       | waiting on the owner's push approval in 75's session |
| Live harness `--rate`, `--noise`, `--snr`                                                     | local `d555e8f`    | 75       | waiting on the owner's push approval                 |

## Decisions

- MIT licence, © Aryan Sajiv. Lead on Opus, workers on Sonnet, one worktree each; workers wait for "push" unless pre-approved; the lead merges only after CI is green.
- Haiku is the default guesser. On the hard set Sonnet was a few items better (not clearly) at about twice the latency; Opus no better. Sonnet via `ANTHROPIC_MODEL`.
- Any mid-sentence pause is a candidate stall; the guesser decides whether the speaker is searching. Pauses are marked "…" between words in what it reads (never at the end). An offered word stays off the list for 3 minutes.
- Deepgram punctuation is off, because it puts full stops at pauses and would hide stalls.
- The profile is opt-in; without it personal words go confidently wrong (0/4, 3 wrong offers). The brief helped little on guessable items.
- Evidence rules: never tune on holdout; intervals and caveats with every number; LLM results vary between runs.
- API keys stay in the lead's checkout; workers get Claude runs from the lead.
- Tests must be hard and realistic. No over-engineering. No stale code.

- Owner's priority (2026-11-09): core functionality that works for every way people speak (slow, fast, stuttering, voice breaks, aphasia, accents, code-switching) and in any environment. Logo deferred. The lead adds what the product needs without being asked.
- Don't finish a word the user has started (a stutter or block). This is a product principle from the stuttering community (`RESEARCH.md`), so s11's started words are expected silent.
- No "say it aloud": the other person would hear it, and it is the "finishing words" people dislike.
- The "description instead of a name" prompt sentence was tried twice and dropped: it failed the bars set beforehand.

## Evidence now

- Dev replay, 20 conversations, real Haiku, three runs on the #64 code: 82–86% correct, 2–3 wrong (always the same three hard items), 1–2 fluent pop-ups out of 165, 0–1 on the other speaker out of 251. Slow, self-correcting and breathy speakers: 9–11 of 11 stalls. The original 17 scenarios average 83%, against an 84% baseline.
- Live (macOS voices, Deepgram + Claude, s01): 6/8, 0 wrong, 0/22 fluent pop-ups.
- Known weak spots: code-switching (1/4: it offers the foreign word), the slow speaker s25 (2/4 in one run, under diagnosis), descriptions with no visible gap (h41).

## Next

1. 75's two PRs (the owner approves the push in 75's session). Then the language setting (`session.settings.language`, `multi`), and 4c's dropdown.
2. c1: diagnose s25. Then the per-language cue table.
3. Live baselines with noise, speaking rate and accent voices (the lead runs these with keys).
4. Holdout run once at the end of this round. Then refresh write-up.md.
5. The owner: hand-check the global shortcuts in `npm run app` (⌘\, ⌘↵, ⌘⇧N, Esc, ⌘2 while a card shows). Send the Hiya logo file. Rotate keys later.

Workers: c1, 4c, 93, 75 (`aryansajiv-75`). One `~/tott-*` worktree each. Rules for the shared machine are in CLAUDE.md. Code map: `graphify-out/` in the lead's checkout.
