---
'nexus-agents': patch
---

fix(pipeline): disclose a bounded QA review instead of recording it as complete

CLAUDE.md requires that a review consume the artifact, and that a bounded read
state which portion was reviewed — "a partial review recorded as complete is
the failure." Two sites in `agent-executor` broke that:

- `qaReview` sent `implementation.slice(0, 3000)` with no marker in the prompt
  and no coverage on the result. `QaReviewResult` was
  `{ verdict, feedback, issues }` — byte-identical for a 500-char and a
  500,000-char implementation — and `dev-pipeline` then set `status: 'done'`
  and persisted the full text on a pass the expert reached from the first 3000
  characters. A defect introduced at character 3001 shipped with a recorded QA
  pass.
- `buildVoteProposal` capped the plan at ~2900 characters. The appended
  research block is explicitly labelled "may be incomplete"; the plan was not,
  so voters were shown a silently-truncated plan as though whole while the vote
  record named the full plan.

Both now disclose. The shape mirrors `packDiffForReview` (#4140), which already
solved this for `pr_review`: within budget the output is byte-identical and
carries no coverage, and over budget a visible NOTE rides on the prompt with a
machine-readable `QaReviewCoverage` on the result.

This lands the honest-labelling half only. Whether a partial QA review should
additionally be barred from marking a task done — as #4140's
`applyPartialCoverageGate` does for `verified: true` — is a behaviour change
tracked separately.
