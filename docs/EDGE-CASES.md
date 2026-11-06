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
