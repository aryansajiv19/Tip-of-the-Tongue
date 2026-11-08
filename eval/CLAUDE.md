# eval/

Offline evaluation through the real server modules. Data is in `data/eval/` (written by us, never copied from a corpus).

- `npm run eval -- --split dev|holdout|all --guesser mock|claude` on `circumlocutions.json`; flags `--set hard`, `--model`, `--no-context`, `--stt-noise`, `--brief-mode`.
- `npm run scenarios -w eval -- ...` replays whole conversations through the real session on a virtual clock; `npm run compare -w eval` puts two runs side by side.
- Results go to `eval-results/` (gitignored); put summaries in `docs/write-up.md` with intervals and caveats.
- Never tune prompts, the mock or the detector on `holdout`. Claude runs need a key: ask the lead.
- Metric math (`metrics.ts`, `score.ts`) is pure and unit-tested; keep the runners thin.
