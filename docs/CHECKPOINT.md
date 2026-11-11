# Checkpoint

Single source of current status. Updated by the lead session when a branch lands or a decision changes.

_Last updated: 2026-11-11, overnight round_

## Now

**2026-11-11 overnight round (owner asleep, lead autonomous):** merged #103–#125. That covers:

- the "…" no-match card (#104);
- skills: topic packs plus custom (#106, #110), with the Topics block and optional continuations, default off and the prompt unchanged when off (#122, #125);
- the multi-voice harness (#114, #121, #123), the loudness-based "me" plus `speaker.count` and the cue-phrase fix (#117), and the "That's me" button (#120);
- README screenshots on a plain backdrop (#111, #112);
- this close-out PR: hygiene, the track rename to **Real-time Assistance**, and the README/ai.md trim.

Measured and dropped:

- escalation to Sonnet failed its bars twice;
- caching changed the prompt layout and cost about 3 points;
- the specialist-term prompt line;
- interim-label and user-turn detector fixes, which showed no live gain (#124 closed).
  Live multi-voice on main: 85% strict, about 92% counting late-correct, voice pick 14/14.

**Prototype status: runnable, and about 90% of the way to "a stranger can install and use it".** Everything planned for the ship round is merged (#67–#91). What remains is hand-checking by a person at the Mac (list below) and the parked items.

What works today:

- `npm run dist` builds an unsigned macOS .dmg. The installed app needs no repo and no `.env`: the user pastes their own Anthropic and Deepgram keys on a setup screen (stored with the macOS Keychain, checked live), or tries demo mode (clearly labelled).
- Checked by a worker on the packaged app (2026-11-10): launch, setup screen, demo banner, bad-key message, socket token, logs free of words and tokens, single instance, clean quit.
- The loop: Deepgram Nova-3 (or browser speech) → stall detector (adaptive pause, cues in en/es/fr/de/hi, stutter-aware) → Haiku guess started early → gate → pop-up about 1.4–1.7 s after the last word. Help level, speed, language, light/dark, Large text, Privacy (forget words), meeting notes, About you, tray menu, start at login, draggable overlay, user guide.
- Failure handling: bad key / busy service in plain words, 60 calls a minute cap, reconnects after network loss or sleep, Deepgram recovery, one listening tab, mic switch and Firefox capture.

**How to resume (new sessions):** read this file, then `CLAUDE.md` (rules, including the scope rule) and the folder `CLAUDE.md` for the area you touch. `git worktree list` shows active worktrees; only `~/voice-airlock-hiya` (main) and `~/tott-eval` (the lead's eval checkout) are expected. Keys live only in `~/voice-airlock-hiya/.env`.

### Hand-check (needs a person at the Mac)

1. `npm run dist`, open the .dmg, drag to Applications, right-click › Open.
2. Paste both keys, "Save and check": two ticks.
3. Allow the microphone, press play, say "I need to book the… the thing you fly in": a suggestion appears.
4. Tray: listening icon, Settings…, Recent words, Start at login. "Get a key" opens the browser. Drag the overlay, quit, reopen: same place.
5. Shortcuts: ⌘\ show/hide, ⌘↵ ask now, ⌘1/2/3 pick, Esc dismiss, ⌘⇧N new conversation.

| Area                                                                                          | PR                 | Owner    | State  |
| --------------------------------------------------------------------------------------------- | ------------------ | -------- | ------ |
| Core loop, eval, hardening, e2e                                                               | #1–#21             | all      | merged |
| Chrome chunked-speech fix                                                                     | #22                | 93       | merged |
| Guesser streaming, thinking-pause items                                                       | #23                | c1       | merged |
| Deepgram server + web, punctuation off                                                        | #24, #26, #27      | lead, 93 | merged |
| Speculative guessing, any-pause rule                                                          | #25                | 4c       | merged |
| Hard set, model comparison (Haiku kept)                                                       | #28                | c1       | merged |
| Frosted pop-up, click to accept                                                               | #29                | 4c       | merged |
| Long-brief glossary (≤ 50k chars)                                                             | #30                | c1       | merged |
| Page design, sensitivity setting                                                              | #31                | 4c       | merged |
| Sound signals, hum cue, manual trigger                                                        | #32                | 93       | merged |
| Deepgram keyterms, debug panel                                                                | #33                | c1       | merged |
| Checkpoint refresh, design tokens, `ai.md`                                                    | #34–#36            | lead, 4c | merged |
| Scenario suite of whole conversations, fixes                                                  | #37                | c1       | merged |
| Context hygiene: docs, dead code                                                              | #38                | c1       | merged |
| Overlay pill, Electron shell, card, settings                                                  | #39, #41           | 4c, 93   | merged |
| Speaker labels; re-pick on new stream                                                         | #40, #42           | c1       | merged |
| Meeting-prep drawer (PDF/md/txt), source                                                      | #43                | 4c       | merged |
| Live-audio scenarios; pop-up counted for the line in progress                                 | #46                | c1       | merged |
| First-run UX, pill labels, mic-denied Retry, bigger overlay (420 px)                          | #47, #49, #53      | 4c       | merged |
| Contrast, Esc in the desktop app, screenshots of every state                                  | #45, #61           | 93       | merged |
| About you + remembered words (`session.profile`)                                              | #48                | 4c       | merged |
| Stray voice label; repeat rule; flaky-test fixes                                              | #51, #52           | c1       | merged |
| Desktop window size, research doc, code map, shared-machine rules                             | #50, #54, #57, #62 | 93, lead | merged |
| ⌘1/2/3 pick (one IPC channel with Esc)                                                        | #56                | 4c       | merged |
| Runtime robustness: Deepgram retry/ping, mic loss, sleep, quiet input; desktop no-key message | #58, #59, #63      | 93       | merged |
| Adaptive pause, stutter-aware detection, self-corrections, 4 scenarios                        | #64                | c1       | merged |
| Help level (first sound / word / only when I ask)                                             | #60                | 4c       | merged |
| Keyterm updates with Deepgram `Configure`; live harness `--rate`/`--noise`/`--snr`            | #67, #68           | 75       | merged |
| Keys backend (safeStorage store, provider check, `window.tott.keys`)                          | #69                | 93       | merged |
| Anthropic failures (401/403 key, 429/529 back-off), `session.ready.guesser`; 60 calls/min cap | #70, #72           | c1       | merged |
| Per-session language (`session.settings.language`); Deepgram recovery probe, early closes     | #74, #77           | 75, lead | merged |
| Turn gap is not a stall marker (s25 "walker"); socket heartbeat, one listening tab            | #75, #78           | c1       | merged |
| Packaging: electron-builder .dmg, server as utilityProcess; static page, socket token, log    | #81, #82           | 93, c1   | merged |
| Word times stay on the clock when audio is dropped; recovery-probe race                       | #83                | 75       | merged |
| Setup screen, demo banner, privacy, light theme, Large text, language dropdown, socket token  | #84                | 4c       | merged |
| Language-aware guessing; es/fr/de/hi cues                                                     | #79                | c1       | merged |
| Start-up hardening (single instance, tray-first, restart once, mic help); tray, login, drag   | #87                | 93       | merged |
| Tray commands, drag region, USER-GUIDE.md                                                     | #89                | 4c       | merged |
| Packaged-app fixes from the install check (userData folder name)                              | #91                | 93       | merged |
| Hand-off docs, realtime-loop project skill                                                    | #92, #93           | lead     | merged |
| `npm run demo`; the desktop app reads the repo `.env` (no setup screen with keys there)       | #94                | 93       | merged |
| Accuracy pass: the word the description defines, specific and whole (dev 93–96%, holdout 94%) | #95, #96           | c1, lead | merged |
| Segmenter for CJK and Thai; capture: noise suppression off, resampler, device switch, errors  | #86, #88           | 75       | merged |

## Decisions

- Users (2026-11-06): anyone who loses a word mid-conversation (meetings, calls, interviews); people with aphasia are one group, not the only one. No model training: prompting and rules, with evidence from our own eval sets.
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
- Distribution (owner, 2026-11-09): bring your own keys, stored with Electron `safeStorage`; unsigned .dmg until there is an Apple Developer account. The keys never go back to the page.
- Branches: we squash-merge, so a branch that needs rebasing is pushed under a new name (`-2`); force-push is not used.
- No "say it aloud": the other person would hear it, and it is the "finishing words" people dislike.
- The "description instead of a name" prompt sentence was tried twice and dropped: it failed the bars set beforehand.

## Evidence now

- Accuracy pass #95 (2026-11-10): dev 93–96% in three runs (wrong 2–4/71, fluent 0–1/165); holdout once 94% (17/18), 1 wrong.

- Dev replay, 20 conversations, real Haiku, three runs on the #64 code: 82–86% correct, 2–3 wrong (always the same three hard items), 1–2 fluent pop-ups out of 165, 0–1 on the other speaker out of 251. Slow, self-correcting and breathy speakers: 9–11 of 11 stalls. The original 17 scenarios average 83%, against an 84% baseline.
- Live (macOS voices, Deepgram + Claude, s01): 6/8, 0 wrong, 0/22 fluent pop-ups.
- Live s01, six voices, stable network: clean 20/24 (1 wrong), café 10 dB 14/24 (2 wrong). Language-aware prompt: dev 90% twice, s19 4/4 and 3/4 with no foreign word. Details in write-up.md.
- Known weak spots: background noise (58% vs 83% clean, mostly missed stalls); descriptions with no visible gap (h41); without speaker labels the other person's stalls can trigger a guess. s25's earlier dip was API timeouts plus one borderline guess; its fluent pop-up was fixed in #75 (with speaker labels).

## Next

Scope (owner, 2026-11-10): a runnable, decent prototype, not a perfect product. Two tries, then park it. For now it is demoed from the owner's Mac with the `.env` keys (`npm run demo`); user accounts and own keys come later.

1. The owner (2026-11-12): the brag demo video (longer, 80–90% of the product; plan G was paused overnight), GitHub polish, the write-up, then submit.
2. The owner: send the Hiya logo file (the tray and app icons are placeholders); rotate keys; delete stale remote branches from rebases.
3. Parked: similar voices merged by Deepgram's labels (s30); a describing stall read across the other person's words (#124 didn't help live); café-noise accuracy; other-speaker pop-ups without speaker labels; one holdout run before any final write-up; code signing and notarisation; a Windows build; a Deepgram "Could not reach" seen once on the first key check (not reproduced).

Workers (all idle at the end of the round): c1 (detector, guesser, session), 4c (web UI), 93 (desktop app, packaging), 75 (`aryansajiv-75`, speech-to-text, audio, languages). One `~/tott-*` worktree each, removed after merge. Rules for the shared machine are in CLAUDE.md. Code map: `graphify-out/` in the lead's checkout.
