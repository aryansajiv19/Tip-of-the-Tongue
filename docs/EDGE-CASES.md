# Edge cases

Each row should become a unit test, an eval item, or a documented limitation.

| Case                                                         | Risk                                | Design answer                                                                                  |
| ------------------------------------------------------------ | ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| User finds the word themselves just before the guess appears | Redundant or patronising offer      | Gate checks the latest words; withdraw the offer if the target was said                        |
| Normal thinking pause in fluent speech                       | False trigger                       | Require an incomplete phrase or a cue phrase, not pause alone                                  |
| Low confidence                                               | Wrong word shown                    | Abstain below threshold; measure false-offer rate                                              |
| Several plausible words ("doctor" vs "nurse")                | Wrong pick                          | Show up to 3 candidates, best first, only if top is confident                                  |
| Personal names, places, pets                                 | Generic guesses miss                | Personal profile list added to the prompt                                                      |
| Semantic paraphasia ("table" said for "chair")               | User says a wrong word, not a pause | Out of scope for the prototype; document                                                       |
| Speech-to-text mishears                                      | Bad context → bad guess             | Use word confidence where available; abstain when transcript confidence is low                 |
| Slow or slurred speech                                       | Pauses everywhere                   | Per-user pause threshold setting                                                               |
| Latency over ~2.5 s                                          | Help arrives too late               | Timeout → abstain; fast model; short prompt                                                    |
| Background noise or another speaker                          | Guessing for the wrong person       | Prototype: single speaker, push-to-listen option; document diarisation as future work          |
| Repeated triggers on the same word                           | Nagging                             | Cooldown per target and per minute                                                             |
| Sensitive conversation                                       | Privacy                             | No audio stored; transcripts in memory only; clear on-screen listening indicator; pause button |
| No API keys                                                  | App doesn't run                     | Mock guesser + browser STT                                                                     |
| Offline / provider error                                     | Silent failure                      | Show a calm status message; never block the conversation                                       |

## Misses seen in the Claude eval

Two runs of the 56-item set (see `docs/write-up.md`). Only the second run recorded the words Claude offered. The data was not changed. For c30 only, a prompt line was added afterwards (see below); it was tuned on dev items.

- **c30, "the red, amber and green lights" (dev, missed in both runs).** Run 2: Claude split the two-word answer into "traffic" (0.9) and "lights" (0.4), so only "traffic" was offered. Pattern: a multi-word target comes back as separate words. We then added one prompt line, "keep multi-word names together as one candidate (e.g. 'post office')", using an example that is not in the eval set. A first version used "traffic lights", c30's own answer, and was replaced because that leaks the answer. With the clean example, c30 returned "traffic lights" as one candidate (0.85-0.9) in 3 of 3 dev reruns. This is tuned on dev, so the gain may partly be noise; the holdout has not been used for it.
- **c36, "the list of things to do next" (dev, missed in run 1, passed in run 2).** Run 2 offered "action items" at exactly 0.6, the gate threshold. Pattern: borderline confidence, so the outcome varies between runs.
- **c18, "the warm thing with sleeves that goes over your jumper" (holdout, missed top-1 in both runs).** Run 2: "cardigan" (0.9), "jacket" (0.5), "coat" (0.3). Claude picked a more specific item of clothing than the word we wrote; "jacket" and "coat" were still offered, so it was not a false offer. Pattern: a specific, plausible word that our acceptable list does not include. Run 1 counted it as a false offer.
