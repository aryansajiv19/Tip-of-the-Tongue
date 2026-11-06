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
- **Our results** (Claude Haiku 5.5 guessing, our detector and gate; 95% Wilson intervals in brackets):

  | Split   | Stuck items | Top-1                | Top-3       | False offers (of offers) | Fluent items where detector fired | Silent items offered | Guess latency p50 / p95 |
  | ------- | ----------- | -------------------- | ----------- | ------------------------ | --------------------------------- | -------------------- | ----------------------- |
  | dev     | 32          | 94% (30/32) [80-98%] | 94% (30/32) | 6% (2/32) [2-20%]        | 0/9                               | 0/13                 | 836 / 1179 ms           |
  | holdout | 9           | 89% (8/9) [56-98%]   | 89% (8/9)   | 11% (1/9) [2-44%]        | 0/1                               | 0/2                  | 831 / 1068 ms           |

  Read these with care. The items are scripted written examples that we wrote, read as text with synthetic timing (300 ms per word, 2 s pauses), not real speech. They have not been tested with people with aphasia, and speech-to-text may mishear real aphasic speech. There are only 41 stall items (9 held out), so the intervals are wide: the holdout result is compatible with anything from about 56% to 98%.

- **Comparison with the 2023 study (91.67%, text only).** Similar setting, not the same task: they used real circumlocutions and a general chatbot, we use descriptions we wrote ourselves, plus a meeting brief and personal words. Our intervals overlap that figure, which is all we can say; it does not show we do better, and our own items are probably cleaner than real speech.

## Approach and why

No training; speech-to-text + rules + Claude + a confidence gate. Silence is a feature.

## Limits (stated plainly)

Not tested with people with aphasia; scripted examples; STT on atypical speech unknown; single speaker.

## Wider reach and next steps

Meetings, non-native speakers, older adults. Phone-call mode. Co-design with people with aphasia and speech and language therapists.
