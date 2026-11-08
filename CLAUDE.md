# Tip of the Tongue

Live word-finding companion (Hiya Voice AI Challenge, Accessibility). It listens, spots when the user is stuck on a word, and offers up to 3 likely words in a small pop-up, only when confident. Staying silent is a feature.

Read first: `docs/README.md` (what each doc is for), `docs/CHECKPOINT.md` (status, decisions), `docs/BRIEF.md` (honest framing). Each folder has its own short `CLAUDE.md`.

## Layout

- `server/` Fastify + ws. `session.ts` is the pipeline for one connection. `web/` Vite + React page. `eval/` offline evals and scenario replay. `e2e/` Playwright. `data/` eval sets, example profile. `app/` desktop overlay shell (in progress).
- Pipeline: speech (Deepgram via the server, else browser Web Speech) → stall detector (any pause, cue phrases, sound signals) → Claude guesser (Haiku, starts early, streamed; mock without key) → gate → pop-up. Details: `docs/ARCHITECTURE.md`.
- Env in `.env.example`. Everything runs with no keys (mock guesser, browser speech).

## Rules

- `npm run lint`, `typecheck`, `test`, `build` pass before any PR (`npm run e2e` for UI/session changes). Unit tests for every pure module; tests are hard and realistic.
- Small and plain: no unrequested abstractions, no dead code or TODOs, no `any` without a comment.
- Conventional Commits, short-lived branches, PRs only. Docs change in the same PR as code.
- Never overclaim (BRIEF "Honest framing"). Never mimic aphasic speech.
- Evals: never tune on `split: "holdout"`; report numbers with intervals and caveats; LLM results vary between runs.
- Privacy: no audio stored, transcripts in memory only, info-level logs never contain words.
- Keys stay in the lead's checkout; never copy `.env` into a worktree.
- UI: large type, high contrast, no flashing, keyboard and screen-reader friendly, respects reduced motion.
- Keep `ai.md` current.

## Multi-session work

- A lead session coordinates; workers use their own worktree and branch and touch only their assigned files.
- Workers report to the lead and wait for "push" unless it was pre-approved. Only the lead merges.
- Use subagents for wide reading; keep context lean. Only the lead edits `docs/CHECKPOINT.md`, except in a hygiene PR.
