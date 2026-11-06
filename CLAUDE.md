# Tip of the Tongue

Live word-finding companion (Hiya Voice AI Challenge, Accessibility). It listens and spots when the user is stuck on a word. Then it offers up to 3 likely words in a small side pop-up, and only when confident. Staying silent is a feature.

Read first: `docs/CHECKPOINT.md` (current status, owners). Product and honest framing: `docs/BRIEF.md`. Design: `docs/ARCHITECTURE.md`. Each workspace has its own short `CLAUDE.md`.

## Stack
Node 22, TypeScript strict, npm workspaces `server/` (Fastify + ws), `web/` (Vite + React), `eval/`. STT: browser Web Speech API (default) or Deepgram if `DEEPGRAM_API_KEY`. Guesses: Anthropic (`ANTHROPIC_MODEL`, default `claude-haiku-5-5`), deterministic mock when no key.

## Rules
- Must run from a clean clone with **no keys**.
- `npm run lint`, `typecheck`, `test`, `build` pass before any PR. Unit tests for every pure module.
- Small and plain: no unrequested abstractions, no dead code or TODOs, no `any` without a comment.
- Conventional Commits, short-lived branches, PRs only (never push to main). Docs change in the same PR as code.
- Never overclaim (see BRIEF "Honest framing"). Never mimic aphasic speech.
- Privacy: no audio stored, transcripts in memory only.
- UI: large type, high contrast, no flashing, keyboard and screen-reader friendly, respects reduced motion.
- Keep `ai.md` current.

## Multi-session work
- A lead session coordinates; workers each use their own git worktree and branch and touch only the files they were assigned.
- Workers report to the lead and wait for "push" before pushing. The lead reviews and merges.
- Use subagents for wide reading. Keep context lean, and update `docs/CHECKPOINT.md` (lead only) when status changes.
