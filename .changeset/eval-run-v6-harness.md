---
'nexus-agents': minor
---

feat(eval): add the v6 pr_review eval batch runner (#4311, epic #3845; unblocks #3849)

Adds `scripts/pr-review-eval-run.ts` (+ pure core `scripts/pr-review-eval-run-core.ts`), the previously-missing connective harness that feeds the rubric-adjudicated corpus (`testing/datasets/pr-review-sample.json`, n=19) through the live 5-voter `pr_review` panel, applies rubric Rule 2 location-tolerance matching, scores each voter's verdict against the case's gold `class`/`knownBugs` via the existing #3848 scorer (`scoreVoterCase` / `computePerVoterPrecisionRecall`), appends verdicts to the `PrReviewEvalStore`, and regenerates `docs/research/pr-review-experiment-results-v6.md`. New `eval:run` npm script. The panel invocation is injectable (`PanelRunner`); the plumbing (corpus load → diff resolution → scoring → aggregation → doc/store write) is unit-tested with a deterministic stub panel — no live model calls in CI. The live v6 pass (real LLM calls, needs model auth) is run on-demand via `npm run eval:run`.
