---
'nexus-agents': minor
---

feat(eval): per-voter pr_review precision/recall metrics + persisted report (#3848)

`pr_review` reported panel-level metrics only (v5), so a chronically-noisy voter
could not be identified or demoted on the Epic D / ADR-0017 authority ladder.
This adds the data plumbing to record, per labeled eval case, EACH voter role's
verdict against the rubric ground truth (#3846) and compute per-voter
precision/recall over time.

- `src/mcp/tools/pr-review-eval-types.ts` — the persisted unit
  `VoterEvalVerdict` (per-voter per-case true-positive / false-positive /
  false-negative tallies + rubric class) and the report types.
- `src/mcp/tools/pr-review-eval-scoring.ts` — two pure, deterministic functions
  (the `computeResearchMaturityReport` / #3727 pattern): `scoreVoterCase`
  applies the rubric class rules (buggy → matched bugs are TP, missed bugs are
  FN; clean → verified findings are strict FP; borderline → excluded from both
  numerators), and `computePerVoterPrecisionRecall` folds a window of verdicts
  into per-role + aggregate precision/recall (zero-positive and no-bugs cases
  report 0, never NaN).
- `src/mcp/tools/pr-review-eval-store.ts` — JSONL-backed store mirroring the
  `PersistentOutcomeStore` idiom (hydrate-on-construct, append-per-write, corrupt
  lines skipped) under the shared learning dir. `reportPrecisionRecall(filter)`
  is the report surface. Stores only scored tallies — never raw diffs, prompts,
  or model outputs.

Record + measure ONLY: no live routing/weighting change. Populating the store
from an actual eval run, and acting on the metrics (voter demotion), are
separate gated activities (#3849 / Epic D). Fixture tests cover the
precision/recall math, the rubric application, and the persistence round-trip.
