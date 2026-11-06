# eval/

Offline evaluation. `npm run eval -- --split dev|holdout|all --guesser mock|claude` runs `data/eval/circumlocutions.json` through the real server modules.
Results go to `eval-results/` (gitignored); the summary table goes in `docs/write-up.md`.
Never tune prompts or the mock on `split: "holdout"`. Items are written by us, never copied from a corpus.
Metric math lives in `src/metrics.ts` and is unit-tested; keep `run.ts` thin.
