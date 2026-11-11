# How AI was used

Which AI tools did what, and how the owner (Aryan Sajiv) directed and checked the work.

## Tools

| Tool                                 | Used for                                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Claude Code (Claude Opus and Sonnet) | Building and testing the project: code, unit and end-to-end tests, evaluation sets and runners, docs                |
| Claude Haiku (inside the product)    | Guessing the word the speaker is reaching for, with confidence scores, and extracting key terms from long documents |
| The brag skill with Hyperframes      | The 70-second demo video at the top of the README, built from the product's own styles                              |
| Deepgram Nova-3 (inside the product) | Streaming speech-to-text with word timings, filler words and speaker labels                                         |

## How the owner directed the work

- **Priorities.** Chose the problem and the Real-time Assistance track, widened the user from people with aphasia to anyone who loses a word mid-conversation, and asked that it work for every way people speak (slow, fast, stuttering, accents, mixed languages) and in any environment.
- **Features.** Chose what to build and what to drop: silence on fluent speech, help after any hesitation, Deepgram, Haiku for speed, the overlay design, ⌘1/2/3 to pick, bring-your-own keys, and no "say it aloud".
- **Checks.** Required hard, realistic tests, CI on every pull request, honest evaluation (never tuning on held-out data) and real-key evaluations before trusting a change.
- **Live testing.** Tested the app by voice and reported what failed; this found, among others, a browser speech bug that split every word onto its own line.

## How the AI work was checked

- Lint, typecheck, unit tests and the build run in CI on Linux, macOS and Windows with Node 22 and 24, plus browser end-to-end tests.
- The evaluation sets were written for this project, never copied from licensed corpora. Holdout items were kept unseen.
- Tests or the owner caught AI mistakes, including an origin-check bypass, a Deepgram reconnect race and a prompt example that leaked an evaluation answer. Prompt changes that failed bars set before the run were dropped.
