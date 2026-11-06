# Plan — one week

| Day | Goal                       | Done when                                                                                         |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | Skeleton + live transcript | Clean clone runs; mic → words on screen with timestamps; CI green                                 |
| 2   | Stuck detection + guessing | Scripted circumlocution triggers a guess from Claude (or mock)                                    |
| 3   | Gate, acceptance, context  | Silent at the start and on fluent speech or self-recovery; meeting brief and running context used |
| 4   | Evaluation                 | `npm run eval` prints top-1/top-3/abstain/false-offer/latency on 40–60 items                      |
| 5   | UI polish + edge cases     | Small, calm, accessible side pop-up (up to 3 options); EDGE-CASES handled or documented           |
| 6   | Demo                       | 2–3 min video recorded; screenshots in `docs/assets/`                                             |
| 7   | Docs + buffer              | README, ai.md, write-up final; fresh-clone test; submit                                           |

**Go/no-go on day 3:** if live latency is over ~3 s, cut the spoken cue, shorten prompts, and fall back to final-transcript triggers only.

## First prompts for Claude Code

1. "Read CLAUDE.md. Set up the npm workspaces (server, web, eval) with strict TypeScript, ESLint, Prettier, Vitest, and the npm scripts lint/typecheck/test/build/dev/eval. Add a minimal Fastify server with a health route and a Vite React page. Propose the plan first."
2. "Add the browser Web Speech API transcript to the web app and stream words with timestamps to the server over WebSocket using the event schema in CLAUDE.md. Then add the Deepgram adapter behind DEEPGRAM_API_KEY."
3. "Implement StuckDetector as a pure function with unit tests covering pauses, filler phrases, describing patterns, and fluent speech that must not trigger."
4. "Implement the Guesser with the Anthropic API returning validated JSON, a 2.5 s timeout that abstains, and a deterministic mock used when no key is set. Then the Gate and AcceptanceTracker with tests."
5. "Build the eval runner over data/eval/circumlocutions.json and print the metrics table."

## Decisions log

- 2026-11-06: Chose Tip of the Tongue (Accessibility track). Reason: strongest fit to the brief's "why voice" paragraph, real need, buildable without training.
- 2026-11-06: Primary user = people with aphasia; meetings/non-native speakers/older adults presented as wider reach, not the core.
- 2026-11-06: No model training; prompting + rules. Evidence comes from our own eval set.
- 2026-11-06: Owner widened the user: anyone can be the main user (meetings, customer calls), aphasia is one group. Added: context builds over the conversation, an optional pre-meeting brief, and a small side pop-up offering a few words ("Is this the word you're looking for?").

- 2026-11-06: MIT licence. Spoken cue via browser `speechSynthesis` (no ElevenLabs). Work split across a lead session and parallel worker sessions, one git worktree each; status in `docs/CHECKPOINT.md`.

- 2026-11-06: Deepgram adapter and spoken cue deferred. The browser STT is enough for the prototype, and a spoken cue would be picked up by the mic as the user saying the word, so it needs echo handling first.
- 2026-11-06: First real eval with Claude (Haiku): dev top-1 94%, holdout 89%, no false triggers on fluent items. Numbers and caveats in `docs/write-up.md`.

## Outreach (optional, high value)

- Message a speech and language therapist or the Stroke Association for a 10-minute chat. Ask: when do people with aphasia most want help? Would an unprompted suggestion feel helpful or intrusive? One quote improves the write-up a lot.
