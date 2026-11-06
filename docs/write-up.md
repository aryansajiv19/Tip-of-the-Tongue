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
- **Our results (mock guesser: plumbing only, not accuracy).** The mock knows only a few dev items, so these numbers show that the pipeline runs end to end. Real Claude numbers replace this table; see `docs/ARCHITECTURE.md` (Evaluation) for the method.

  | Split   | Stuck items | Detected    | Top-1      | Top-3      | Abstain     | False offers (of offers) | Fluent items where detector fired | Silent items offered |
  | ------- | ----------- | ----------- | ---------- | ---------- | ----------- | ------------------------ | --------------------------------- | -------------------- |
  | dev     | 32          | 97% (31/32) | 19% (6/32) | 19% (6/32) | 78% (25/32) | 0% (0/6)                 | 11% (1/9)                         | 0% (0/13)            |
  | holdout | 9           | 89% (8/9)   | 0% (0/9)   | 0% (0/9)   | 89% (8/9)   | n/a                      | 0% (0/1)                          | 0% (0/2)             |

## Approach and why

No training; speech-to-text + rules + Claude + a confidence gate. Silence is a feature.

## Limits (stated plainly)

Not tested with people with aphasia; scripted examples; STT on atypical speech unknown; single speaker.

## Wider reach and next steps

Meetings, non-native speakers, older adults. Phone-call mode. Co-design with people with aphasia and speech and language therapists.
