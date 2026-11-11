# How AI was used

This project was built with heavy AI assistance. This file says plainly which tools did what, and what the owner (Aryan Sajiv) decided and did.

## Tools

| Tool                                              | Used for                                                                                                                                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code, one lead session (Claude Opus)       | Planning, splitting work, writing the scaffold, the pipeline and the Deepgram server adapter, reviewing and merging every pull request, running evaluations with the owner's API keys |
| Claude Code, four worker sessions (Claude Sonnet) | Building modules in parallel, each in its own git worktree: speech handling, stall detection, guesser and gate, evaluation sets and runners, hardening, UI, runtime robustness        |
| Claude Code subagents                             | Wide code reading, a desk review of research on speech diversity (`docs/RESEARCH.md`), a feature audit, and the local code map (graphify)                                             |
| Claude Code with the brag skill and Hyperframes   | The 25-second demo video at the top of the README, built from the product's own styles                                                                                                |
| Claude Haiku (inside the product)                 | Guessing the word the speaker is reaching for, with confidence scores, and extracting key terms from long documents                                                                   |
| Deepgram Nova-3 (inside the product)              | Streaming speech-to-text with word timings and filler words                                                                                                                           |

## What the owner decided and did

- **Problem and users.** Chose the problem and the Real-time Assistance track. Widened the user from people with aphasia to anyone who loses a word mid-conversation (meetings, interviews, calls).
- **Product behaviour.** Required that it stays silent on fluent speech, works after any hesitation (not only cue phrases), feels instant, and uses context (meeting briefs, documents, prior meetings).
- **Working rules.** Set the rules for the AI sessions:
  - one lead and parallel workers, each in its own worktree;
  - PRs only;
  - hard, realistic tests rather than soft ones;
  - no over-engineering and no stale code;
  - honest evaluation (no tuning on the held-out data).
- **Testing.** Tested the app live by voice and reported what failed. This found the browser speech bug: each word shown as its own line, and missed suggestions.
- **Decisions.**
  - **Speech:** added Deepgram.
  - **Model:** kept Claude Haiku for speed after the model comparison.
  - **Licence:** chose MIT.
  - **UI:** the overlay specification (a floating control pill and a suggestion card), the macOS menu-bar icon, and the visual system.
- **Priorities.** Asked that the product work for every way people speak (slow, fast, stuttering, voice breaks, accents, mixed languages) and in any environment, and that the lead add whatever the product needs without waiting to be asked. Asked for a bigger, easier overlay and for ⌘1/2/3 to pick a word. Added a fourth worker session.
- **Reviews.** Reviewed progress and approved each phase before work started.

## How the AI work was checked

- Every change went through a pull request. Lint, typecheck, unit tests and the build run in CI on Linux, macOS and Windows with Node 22 and 24, plus browser end-to-end tests.
- The evaluation sets were written for this project, never copied from licensed corpora. Holdout items were kept unseen and run once at the end of each tuning round.
- Several AI mistakes were caught by tests or by the owner and fixed, including:
  - a pipeline gap where an answer said just before a pause still popped up;
  - an origin-check bypass;
  - a Deepgram reconnect race;
  - a prompt example that leaked an evaluation answer;
  - a merge made while one CI job was failing (the merge step now stops on any failed check);
  - orphaned load-test processes that slowed the owner's machine (now a written team rule).

  Two prompt changes were measured against bars set before the runs, failed them, and were dropped.

  These are recorded in the PR history and in `docs/EDGE-CASES.md`.

## Log

| Date          | Tool                                         | What for                                                                                                                  | Owner's role                                                            |
| ------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 2026-11-06    | Claude Code (Opus lead, Sonnet workers)      | Scaffold, core pipeline, evaluation, hardening, Deepgram                                                                  | Set direction and rules, tested live, approved phases                   |
| 2026-11-07/08 | Claude Code (Opus lead, Sonnet workers)      | Realistic conversation tests and accuracy fixes, overlay redesign                                                         | Specified the overlay UI, tested live, approved the plan                |
| 2026-11-09    | Claude Code (Opus lead, four Sonnet workers) | Live-audio tests, meeting prep, About you, help level, adaptive and stutter-aware detection, runtime robustness, research | Set priorities, tested live, approved features and sessions             |
| 2026-11-09/10 | Claude Code (Opus lead, four Sonnet workers) | Installable app: .dmg, own keys in the keychain, setup and demo, privacy, languages, failure handling, audio capture      | Chose own keys and unsigned .dmg; asked for a prototype, not perfection |
| 2026-11-10    | Claude Code (Opus lead, subagent)            | Accuracy pass, `npm run demo`, README demo video and layout                                                               | Tested the demo, chose the README direction                             |
