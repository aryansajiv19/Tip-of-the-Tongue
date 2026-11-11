# eval/

Offline evaluation through the real server modules. Data is in `data/eval/` (written by us, never copied from a corpus).

- `npm run eval -- --split dev|holdout|all --guesser mock|claude` on `circumlocutions.json`; flags `--set hard|specialist` (with `--skills match|off|wrong` on the specialist set: the item's own pack, none, or the next pack along), `--only h41,h02 --runs 5` (single items, repeated; the file name carries the ids), `--model`, `--no-context`, `--stt-noise`, `--brief-mode`.
- `npm run scenarios -w eval -- ...` replays whole conversations through the real session on a virtual clock; `npm run compare -w eval` puts two runs side by side.
- `npm run scenarios:live` speaks the scenarios with macOS `say` through the real server (Deepgram and Claude keys in the environment, runs in real time); use `--dry-run`, `--scenario`, `--voices` to limit.
- Results go to `eval-results/` (gitignored); put summaries in `docs/write-up.md` with intervals and caveats.
- Never tune prompts, the mock or the detector on `holdout`. Claude runs need a key: ask the lead.
- Metric math (`metrics.ts`, `score.ts`) is pure and unit-tested; keep the runners thin.
