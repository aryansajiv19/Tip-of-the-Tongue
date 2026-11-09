# Research: how people speak, and what that means for the app

This is a desk review (web sources, 2026-11-09), not a study of our own users. "[?]" marks a secondary source or a claim we couldn't check against the primary paper.

## Speech that breaks a pause-only detector

| Who                       | What it looks like                                                                                                                                                                                                                                                                                                        | What the app should do                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Slow and fast speakers    | Phone speech runs from 111 to 291 wpm across speakers ([LDC](https://www.ldc.upenn.edu/sites/default/files/interspeech2006-towards-integrated-understanding.pdf)). Silent pauses are log-normal, with a normal planning mode near 1.5 s ([Campione & Véronis](https://mail.sprosig.org/sp2002/pdf/campione-veronis.pdf)). | Set the pause threshold from each speaker's own gaps. A long silence alone is weak evidence.    |
| Stuttering                | Blocks (often before a word), part-word repetitions ("c- c- can"), prolongations ([ASHA](https://www.asha.org/practice-portal/clinical-topics/fluency-disorders/)).                                                                                                                                                       | The speaker knows the word. Don't offer it.                                                     |
| Cluttering                | Fast or irregular rate, revisions, "I mean" ([ASHA](https://www.asha.org/practice-portal/clinical-topics/fluency-disorders/)).                                                                                                                                                                                            | A revision isn't a stall. Expect more recognition errors.                                       |
| Parkinson's               | Quiet, breathy speech, with more frequent pauses ([Mollaei et al.](https://centaur.reading.ac.uk/129487/1/Mollaei%20et%20al.%2C%202026.pdf)).                                                                                                                                                                             | Quiet words drop out of the transcript and look like silence. Warn when the input is too quiet. |
| ALS and severe dysarthria | Slower rate. Over 51% word error on every system tested, Nova-3 included ([Strathclyde](https://strathprints.strath.ac.uk/96698/)).                                                                                                                                                                                       | Allow a per-user pace. Expect noisy context.                                                    |
| Aphasia                   | Anomic: circumlocution, "thing" or "stuff". Broca's: a pause between most words. Paraphasias are wrong words said without a pause ([ASHA](https://www.asha.org/public/speech/disorders/aphasia/)).                                                                                                                        | Circumlocution is the strongest cue. Never offer a word the user rejected.                      |
| Older speakers            | More tip-of-the-tongue states, mostly from failing to retrieve the sound of the word ([Frontiers 2020](https://www.frontiersin.org/articles/10.3389/fpsyg.2020.00338)).                                                                                                                                                   | A first-sound cue fits well.                                                                    |
| Voice breaks              | Gaps inside a word ([ASHA](https://www.asha.org/public/speech/disorders/spasmodic-dysphonia/)).                                                                                                                                                                                                                           | Ignore gaps inside a word or a partial word.                                                    |
| Non-native speakers       | More pauses, and more of them mid-clause ([Reading](https://centaur.reading.ac.uk/31323/)).                                                                                                                                                                                                                               | Calibrate per user.                                                                             |
| Code-switching            | Words from two languages in one sentence. `filler_words` is English-only ([Deepgram](https://developers.deepgram.com/docs/filler-words)).                                                                                                                                                                                 | Offer the word in the sentence's language, and don't rely on fillers outside English.           |

## Supplying words

- **Stuttering.** Don't finish words or sentences ([Stuttering Foundation](https://www.stutteringhelp.org/6-tips-speaking-someone-who-stutters-0)). Being cut off was the top complaint about voice assistants: 61% ([Lea et al. 2023](https://arxiv.org/abs/2302.09044)). Ask each person what they prefer ([Stamma](https://stamma.org/sites/default/files/2026-05/Interviewing%20people%20who%20stammer%20-%20guide%20for%20the%20media.pdf)). Suggestions should be opt-in, silent and private.
- **Aphasia.** Allow time, and don't fill in the word unless asked ([NAA](https://aphasia.org/aphasia-friendly-communication-tips/)). First-sound cues helped every anomia type ([Frontiers 2021](https://www.frontiersin.org/articles/10.3389/fnhum.2021.747391/text), n=15). Clinicians go from least to most: meaning, first sound, written word, whole word [?]. We found no study of which cue users themselves prefer.

## Environment and Deepgram

- Noise and reverb can keep VAD on, so endpointing never fires ([Deepgram](https://developers.deepgram.com/docs/understanding-end-of-speech-detection)). The effect of Bluetooth mics is unmeasured [?].
- `utterance_end_ms` (1000–5000 ms) looks at gaps between transcribed words, so it ignores non-speech noise ([docs](https://developers.deepgram.com/docs/utterance-end)). `vad_events` sends SpeechStarted, which can cancel a pending pop-up ([docs](https://developers.deepgram.com/docs/speech-started)).
- `smart_format` turns punctuation on, so it stays off ([docs](https://developers.deepgram.com/docs/smart-format)).
- Keyterms can be changed mid-stream with a `Configure` message, without reconnecting ([docs](https://developers.deepgram.com/docs/keyterm)).
- `language=multi` labels each word's language. Deepgram recommends `endpointing=100` with it ([docs](https://developers.deepgram.com/docs/multilingual-code-switching)).

## Display and control

- There's no evidence for dyslexia fonts ([n=12](https://pmc.ncbi.nlm.nih.gov/articles/PMC5629233/)). Use large sans-serif text in sentence case ([PubMed](https://pubmed.ncbi.nlm.nih.gov/21682542/)).
- Users must be able to control auto-updating content and timing ([WCAG 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html), [2.2.1](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html)).
- Speech can reveal health conditions, which GDPR treats as special-category data ([Art. 9](https://gdpr-info.eu/art-9-gdpr/)). 37% of people who stutter didn't want others to hear them use a voice assistant ([Lea et al.](https://arxiv.org/abs/2302.09044)). Speaking the word aloud would be heard by the other person, so it is off by default.

## What we're doing about it

1. Pause threshold set from the speaker's own gaps (c1).
2. Stutter-aware detection: no offer during repetitions or blocks of a word already started (c1).
3. Rejected words ("fork, no, the…") never offered. "Thing" and "stuff" count as search cues (c1).
4. `utterance_end_ms` and `vad_events` measured. Keyterms updated with `Configure`. A language setting with `multi` (75).
5. A help-level setting: off, first sound only, or words. Asked on first run (4c).
6. A quiet-input and noise warning (4c, 93).
