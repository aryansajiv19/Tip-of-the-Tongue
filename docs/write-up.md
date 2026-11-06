# Tip of the Tongue — one-page write-up

> Track: Accessibility. Structured around the brief's key paragraph. Keep to one page.

## The moment

Someone with aphasia is mid-conversation and can't find a word they know. They talk around it: "the place… where you get medicine…". The other person guesses, the conversation stalls, and confidence drops.

## The friction

Existing word-finding tools make you stop and search (type, draw, photograph) — exactly when you can't stop. Aphasia often affects reading and writing too.

## What the agent does

Listens, notices the struggle, guesses the word from context, and offers it quietly — only when confident, and never if the person finds it first.

## Why voice, at the key moments

- Mid-sentence, speaking to someone: the input already _is_ speech.
- A keyboard breaks the conversation and may not be usable.
- Real-time: help after ~2 s is useless.

## Evidence

- Scale: ~350,000 people with aphasia in the UK.
- Prior study: LLM identified the intended word 91.67% of the time from text.
- **Our results** (Claude Haiku 5.5 guessing, our detector and gate; 95% Wilson intervals in brackets). Runs 1 and 2 are full runs of the same code, because the guesser is an LLM and results vary between runs. The "final" rows are the shipped prompt, which has one extra sentence added after run 2 (keep multi-word names together), tuned on dev; the holdout was run once with it:

  | Run   | Split         | Stuck items | Top-1                           | Top-3                 | False offers (of offers)   | Guess latency p50 / p95 |
  | ----- | ------------- | ----------- | ------------------------------- | --------------------- | -------------------------- | ----------------------- |
  | 1     | dev           | 32          | 94% (30/32) [80-98%]            | 94% (30/32) [80-98%]  | 6% (2/32) [2-20%]          | 836 / 1179 ms           |
  | 1     | holdout       | 9           | 89% (8/9) [56-98%]              | 89% (8/9) [56-98%]    | 11% (1/9) [2-44%]          | 831 / 1068 ms           |
  | 2     | dev           | 32          | 97% (31/32) [84-99%]            | 97% (31/32) [84-99%]  | 3% (1/32) [1-16%]          |                         |
  | 2     | holdout       | 9           | 89% (8/9) [56-98%]              | 100% (9/9) [70-100%]  | 0% (0/9) [0-30%]           |                         |
  | 2     | all           | 41          | 95% (39/41) [84-99%]            | 98% (40/41) [87-100%] | 2% (1/41) [0-13%]          | 798 / 1033 ms           |
  | final | dev, 3 reruns | 32 each     | 100% (32/32) [89-100%] in all 3 | 100% in all 3         | 0% (0/32) [0-11%] in all 3 | 821-826 / 959-1111 ms   |
  | final | holdout, once | 9           | 89% (8/9) [56-98%]              | 89% (8/9) [56-98%]    | 11% (1/9) [2-44%]          | 795 / 1048 ms           |

  In every run the detector fired on 0 of the 10 fluent items and the app offered nothing on any of the 15 silent items (fluent and self-recovered). Read these with care. The items are scripted written examples that we wrote, read as text with synthetic timing (300 ms per word, 2 s pauses), not real speech. They have not been tested with people with aphasia, and speech-to-text may mishear real aphasic speech. There are only 41 stall items (9 held out), so the intervals are wide: the holdout result is compatible with anything from about 56% to 98%. On the holdout, top-1 was 8/9 in all three runs, with the same miss (c18) each time. Dev went from 30-31/32 to 32/32 after the prompt change, but the holdout did not move, which is weak evidence that the dev tuning did not overfit (n = 9, and the tuned line targeted a different failure than c18). The few misses are described in `docs/EDGE-CASES.md`.

- **Comparison with the 2023 study (91.67%, text only).** Similar setting, not the same task: they used real circumlocutions and a general chatbot, we use descriptions we wrote ourselves, plus a meeting brief and personal words. Our intervals overlap that figure, which is all we can say; it does not show we do better, and our own items are probably cleaner than real speech.

- **What the brief, the profile and speech-to-text noise change** (same shipped prompt, Claude Haiku 5.5, 95% Wilson intervals; dev was run twice and the two runs were identical except for noise):

  | Condition                                 | Split   | Detected | Top-1           | False offers (of offers) |
  | ----------------------------------------- | ------- | -------- | --------------- | ------------------------ |
  | Clean (brief and profile)                 | dev     | 32/32    | 32/32 [89-100%] | 0/32 [0-11%]             |
  | No brief, no profile                      | dev     | 32/32    | 27/32 [68-93%]  | 4/31 [5-29%]             |
  | Simulated speech-to-text noise, run 1 / 2 | dev     | 32/32    | 31/32 / 30/32   | 0/32 / 1/31              |
  | Clean                                     | holdout | 9/9      | 8/9 [56-98%]    | 1/9 [2-44%]              |
  | No brief, no profile                      | holdout | 9/9      | 8/9 [56-98%]    | 0/8 [0-32%]              |
  | Simulated speech-to-text noise            | holdout | 9/9      | 7/9 [45-94%]    | 1/9 [2-44%]              |

  By category on dev, with context then without: personal-profile words went from 4/4 correct (0 false offers) to 0/4, with 3 false offers out of 3 offers (the fourth item got no guess). Without the profile it was not just silent but confidently wrong, for example "corner shop" for Corner Mart and "daughter" for Priya. Meeting-work items went from 6/6 to 5/6 (one false offer: "invoicing software" for the Ledgerly tool). So the personal profile is essential for personal words. The meeting brief moved only 1 of 6 dev work items (0 of 1 on the holdout), because our work items can mostly be guessed from the utterance alone. This does not show that the brief makes the app useful from the first minute; it was not tested on items that really need it, and we do not claim it.

  The noise is a simple stand-in for Chrome's Web Speech (um/uh/er dropped, lowercase, no punctuation, about 10% of non-target words swapped for a mishearing from a small fixed table, target words untouched, pauses kept). The detector still fired on every stall item, and top-1 dropped by one or two items. One effect: the multi-word fix is not fully robust, and "traffic lights" was again split in one noisy run. This is not a measure of real recognition errors, and atypical speech may be recognised worse. With 1 to 6 items per category, one item moves a rate a lot.

## Approach and why

No training; speech-to-text + rules + Claude + a confidence gate. Silence is a feature.

## Limits (stated plainly)

Not tested with people with aphasia; scripted examples; STT on atypical speech unknown; single speaker.

## Wider reach and next steps

Meetings, non-native speakers, older adults. Phone-call mode. Co-design with people with aphasia and speech and language therapists.
