# Tip of the Tongue — project brief for Claude Code

Entry for the Hiya Voice AI Challenge, **Accessibility** track.

## What we are building

A live word-finding companion for anyone who loses a word mid-conversation: in a meeting, on a call with a customer, or day to day. People with aphasia are one important group, not the only one.

1. The app listens to the conversation, with permission, in the browser.
2. **It builds context first.** At the start it knows nothing and stays silent. It learns the topic as the conversation goes on (a running summary plus the last few sentences).
3. **Optional meeting brief.** Before a meeting the user can give it context (agenda, people's names, product or client terms, notes), so it is useful from the first minute.
4. It notices when the user is stuck: a long pause, filler ("the thing", "you know", "what's it called"), or describing a thing instead of naming it ("the tool we use for invoices").
5. It asks Claude for likely words, with confidence scores, using the brief and the conversation so far.
6. If confidence is high enough **and** the user hasn't found the word themselves, a **small pop-up at the side of the screen** asks "Is this the word you're looking for?" with a few options (up to 3). Optionally a soft spoken cue.
7. If the user then says one of the words, that counts as accepted. If they find it themselves first, the pop-up is withdrawn.
8. **Staying silent is a feature.** A wrong or premature guess is worse than no guess. Only the user's own stalls trigger it, not the other person's.

Example: brief says "Q3 review with Northwind (fictional), renewal of the analytics licence". Mid-call: "we'd need to sort out the… the thing, the yearly… what's it called…" → pop-up: **renewal? · licence? · contract?** → user says "renewal" and carries on.

## Why voice (keep this argument sharp)

- The key moment is mid-sentence, while speaking to another person. Stopping to type or search breaks the conversation.
- Aphasia often affects reading and writing too, so a keyboard often isn't an option at all.
- Real-time interaction and emotion (frustration, loss of confidence) are at the centre.
- Existing tools (QARC WordFinder, "What Word?") make the user start a search. This one works inside the conversation, unprompted.

## Honest framing (do not overclaim)

- Users: anyone who loses words mid-conversation (meetings, customer calls, non-native speakers, older adults), including people with aphasia after stroke (~350,000 in the UK). Don't claim clinical benefit.
- One mic hears both sides of a conversation. The prototype can't tell speakers apart reliably; say so.
- No model training. Off-the-shelf speech-to-text + Claude prompting + rule-based logic.
- Evidence: a 2023 study found ChatGPT identified the intended word from real circumlocutions 91.67% of the time — on text, not live speech. Our job is to measure the live version.
- The prototype is tested on our own written examples in the documented style of circumlocution. It has **not** been tested with people with aphasia. Say so.
- Speech-to-text may mishear real aphasic speech. Say so.
- Never mimic or mock aphasic speech in the demo. Use written examples read clearly, and say they are scripted.

## Default stack

- Node 22+, TypeScript (strict), npm workspaces: `server/`, `web/`, `eval/`.
- Server: Fastify + `ws`. Web: Vite + React.
- Speech-to-text: **Deepgram streaming** (gives word timestamps, needed for pause detection) when `DEEPGRAM_API_KEY` is set; fallback to the browser Web Speech API with approximate timing so the app runs with no keys at all.
- Guessing: Anthropic API, model from `ANTHROPIC_MODEL` (default `claude-haiku-5-5` for speed). Without a key, use a small deterministic mock guesser so the demo and tests still run.
- Optional spoken cue: browser `speechSynthesis`.

## Architecture (keep modules small and pure where possible)

```
mic -> STT stream -> TranscriptBuffer -> StuckDetector -> Guesser -> Gate -> UI
                                                   ^           |
                                     Profile (personal words)  v
                                                         AcceptanceTracker
```

- `StuckDetector` (pure): input = recent words with timestamps; output = `{stuck: boolean, reason, contextWindow}`. Rules: pause > `STUCK_PAUSE_MS` (default 1500) after an incomplete phrase; filler/circumlocution cue phrases; describing patterns ("the thing you…", "where you…", "the man who…").
- `Guesser`: calls Claude with the context window + profile; must return JSON `{candidates: [{word, confidence}], abstain: boolean}`. Validate with zod. Timeout 2500 ms → abstain.
- `Gate` (pure): show only if top confidence ≥ `GATE_MIN_CONFIDENCE` (default 0.6), the word wasn't said in the meantime, and the cooldown has passed.
- `AcceptanceTracker` (pure): offered word spoken within N seconds → accepted; else expired.
- Event schema over WebSocket: `transcript.partial`, `transcript.final`, `stuck.detected`, `guess.offered`, `guess.withdrawn`, `guess.accepted`, `guess.expired`.

## Evaluation (this is our evidence — treat as first-class)

- `data/eval/circumlocutions.json`: written by us, never copied from AphasiaBank or other licensed corpora. Each item: `{id, context, utterance, target, acceptable[], category, split}`. Aim for 40–60 items, ~20% held out (`split: "holdout"`) and not looked at while tuning prompts.
- `npm run eval` reports: top-1, top-3, abstain rate, false-offer rate (offered but wrong), latency p50/p95. Write results to `eval-results/` (gitignored) and paste the summary table into `docs/write-up.md`.
- Also include "not stuck" items (fluent speech) to measure false triggers of `StuckDetector`.

## Layout

```
server/   Fastify + ws, STT adapters, guesser, gate
web/      React UI (small side pop-up, calm, high-contrast; up to 3 words)
eval/     offline evaluation runner
data/eval/        test set
data/profiles/    example profiles and meeting briefs (fictional)
docs/     PLAN, ARCHITECTURE, EDGE-CASES, write-up, assets
```

## Repo quality bar (Hiya engineers will read this repo)

- Strict TypeScript, ESLint + Prettier, no `any` without a comment explaining why.
- `npm run lint`, `typecheck`, `test`, `build` all pass; CI green.
- Unit tests for every pure module (`StuckDetector`, `Gate`, `AcceptanceTracker`, guesser JSON parsing).
- Conventional Commits, short-lived feature branches, small PRs.
- No dead code or TODOs at submission. Docs updated in the same change as code.
- Clean-clone quick start works with **no API keys** (mock guesser + browser STT).
- Privacy: no audio stored; transcripts kept in memory only; nothing sent anywhere except the configured STT/LLM providers. State this in README.
- Accessibility of the UI itself: large type, high contrast, no flashing, keyboard and screen-reader friendly, respects reduced motion.
- Ask the owner before choosing a LICENSE.

## Working agreements

- Before a big change, propose a short plan and wait for a yes.
- Explain non-obvious code in plain English in the PR description — the owner must be able to explain every part in review.
- Keep `ai.md` updated: which AI tools were used, for what, and what the owner did themselves.

## Definition of done

- [ ] Clean clone → `npm install` → `npm run dev` works with no keys.
- [ ] Live demo: speak a scripted circumlocution, word appears within ~2 s, accepted when spoken.
- [ ] Stays silent on fluent speech and when the user self-recovers.
- [ ] `npm run eval` produces the metrics table; numbers are in the write-up.
- [ ] README, ai.md, ARCHITECTURE, EDGE-CASES, write-up complete.
- [ ] 2–3 minute demo video in `docs/assets/`.
