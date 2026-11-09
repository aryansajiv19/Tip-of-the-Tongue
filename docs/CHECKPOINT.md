# Checkpoint

Single source of current status. Updated by the lead session when a branch lands or a decision changes.

_Last updated: 2026-11-09 (evening)_

## Now

Goal: a working MVP with a nice UI. The full loop runs live: Deepgram Nova-3 (keyterms from the profile and brief) or browser speech → stall detector (any pause, cue phrases, sound signals) → Haiku guess started 300 ms into a pause → gate → pop-up. A guess takes about 0.8 s; in the scenario tests the pop-up appears about 1.4 s after the last word.

| Area                                                                                            | PR            | Owner    | State       |
| ----------------------------------------------------------------------------------------------- | ------------- | -------- | ----------- |
| Core loop, eval, hardening, e2e                                                                 | #1–#21        | all      | merged      |
| Chrome chunked-speech fix                                                                       | #22           | 93       | merged      |
| Guesser streaming, thinking-pause items                                                         | #23           | c1       | merged      |
| Deepgram server + web, punctuation off                                                          | #24, #26, #27 | lead, 93 | merged      |
| Speculative guessing, any-pause rule                                                            | #25           | 4c       | merged      |
| Hard set, model comparison (Haiku kept)                                                         | #28           | c1       | merged      |
| Frosted pop-up, click to accept                                                                 | #29           | 4c       | merged      |
| Long-brief glossary (≤ 50k chars)                                                               | #30           | c1       | merged      |
| Page design, sensitivity setting                                                                | #31           | 4c       | merged      |
| Sound signals, hum cue, manual trigger                                                          | #32           | 93       | merged      |
| Deepgram keyterms, debug panel                                                                  | #33           | c1       | merged      |
| Checkpoint refresh, design tokens, `ai.md`                                                      | #34–#36       | lead, 4c | merged      |
| Scenario suite of whole conversations, fixes                                                    | #37           | c1       | merged      |
| Context hygiene: docs, dead code                                                                | #38           | c1       | merged      |
| Overlay pill, Electron shell, card, settings                                                    | #39, #41      | 4c, 93   | merged      |
| Speaker labels; re-pick on new stream                                                           | #40, #42      | c1       | merged      |
| Meeting-prep drawer (PDF/md/txt), source                                                        | #43           | 4c       | merged      |
| Live-audio scenarios; pop-up counted for the line in progress                                   | #46           | c1       | merged      |
| First-run UX, pill labels, mic-denied Retry                                                     | #47, #49      | 4c       | merged      |
| Overlay polish: contrast (0.88 glass), Esc in the desktop app                                   | #45           | 93       | merged      |
| About you + remembered words (`session.profile`)                                                | #48           | 4c       | merged      |
| Bigger overlay (420 px, 56 px pill, 44 px targets)                                              | #53           | 4c       | merged      |
| Stray voice label; longer forms stay off the list                                               | #51, #52      | c1       | merged      |
| Desktop window 420 px, height clamps to the work area                                           | #50           | 93       | CI          |
| Research on speech diversity (`RESEARCH.md`)                                                    | #54           | lead     | open        |
| Runtime robustness (network, mic, sleep, long meetings, quiet input)                            | next          | 93       | in progress |
| ⌘1/2/3 pick; help level (first sound / word / ask only); quiet-input warning; language dropdown | next          | 4c       | in progress |
| Pace from the speaker's own gaps; stutter-aware; self-corrections; 9 new scenarios              | next          | c1       | in progress |
| STT and languages: noise/rate in live harness, `language` incl. `multi`, Deepgram options       | next          | 75       | in progress |

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

Dev replay of 17 conversations with real Haiku (diarisation off): 84% (51/61) [72–91], 3 wrong, 0/146 in fluent lines, 4/7 in self-recoveries. Weak spots: code-switching (1/4, it offers the foreign word itself), a profile name from a family description, and self-recoveries. Live (macOS voices, Deepgram + Claude, s01): 6/8, 0 wrong, 0/22 fluent, 1/26 on the other speaker, pop-up about 1.7 s after the last word.

## Next

Merge #50 and #54. Then robustness (93), help level and ⌘1/2/3 (4c), pace and stutter (c1), and the language setting plus live noise/accent baselines (75; the lead runs anything that needs keys). Then screenshots, then the README overhaul. Workers: 93, 4c, c1, 75 (`aryansajiv-75`), one `~/tott-*` worktree each. Holdout runs once per round.
