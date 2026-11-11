# Product brief

Entry for the Hiya Voice AI Challenge, **Real-time Assistance** track.

## What it does

A live word-finding companion for anyone who loses a word mid-conversation: in a meeting, on a customer call, or day to day. People with aphasia are one important group, not the only one.

1. Listens to your microphone, with permission.
2. Builds context first. At the start it knows nothing and stays silent. It learns the topic as the conversation goes on (a running summary plus the last few sentences).
3. Optional meeting brief: agenda, names, product or client terms, notes. This makes it useful from the first minute.
4. Notices when the user is stuck: a long pause, filler ("the thing", "you know", "what's it called"), or describing a thing instead of naming it ("the tool we use for invoices").
5. Asks Claude for likely words with confidence scores, using the brief and the conversation so far.
6. If confidence is high enough **and** the user hasn't found the word themselves, a small pop-up at the side shows up to 3 likely words.
7. If the user then says one of the words, it counts as accepted. If they find it themselves first, the pop-up is withdrawn.
8. **Staying silent is a feature.** A wrong or premature guess is worse than no guess.

Example: the brief says "Q3 review with Northwind (fictional), renewal of the analytics licence". Mid-call: "we'd need to sort out the… the thing, the yearly… what's it called…" → **renewal? · licence? · contract?** → the user says "renewal" and carries on.

## Why voice

- The key moment is mid-sentence, while speaking to another person. Stopping to type or search breaks the conversation.
- For some users, for example with aphasia, typing is hard too.
- Real-time interaction and emotion (frustration, loss of confidence) are at the centre.
- Existing tools (QARC WordFinder, "What Word?") make the user start a search. This one works inside the conversation, unprompted.

## Honest framing

- Users: anyone who loses words mid-conversation, more often in a second language, when tired, or with a stammer, brain fog or aphasia. No claim of clinical benefit.
- One mic hears both sides of a conversation. With Deepgram the voices are labelled and only the user's voice starts a guess, but the voice is chosen from the first words after Start and can be wrong; with browser speech the prototype can't tell speakers apart.
- No model training: off-the-shelf speech-to-text, Claude prompting and rule-based logic.
- A 2023 study found ChatGPT identified the intended word from real circumlocutions 91.67% of the time, on text rather than live speech. Our job is to measure the live version.
- Tested on our own written examples in the documented style of circumlocution, **not** with people with aphasia.
- Speech-to-text may mishear real aphasic speech.
- The demo never mimics aphasic speech: written examples, read clearly, stated as scripted.
