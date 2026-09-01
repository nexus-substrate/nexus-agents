---
'nexus-agents': patch
---

fix(orchestration): disclose when triangulated review saw only part of the diff

`buildReviewPrompt` did `diff.slice(0, 6000)` beneath a prompt that asserts
completeness ("You are reviewing code changes", "Diff to review"), and
`TriangulatedReviewResult` carried no coverage field. A 6001-byte diff produced
output indistinguishable from a whole-diff review — including the corroboration
count, which is the number a reader trusts most because agreement across CLIs
reads as independent confirmation.

CLAUDE.md: "A partial review honestly labeled is fine; a partial review recorded
as complete is the failure."

Three changes:

- **`packDiffForReview` (#4140) instead of a character slice.** This is a diff,
  so packing whole files matters: no reviewer receives a corrupted mid-hunk
  fragment that reads as complete, and the security-first ordering means the
  highest-risk files are the ones that survive a tight budget. The 6000-byte
  budget is unchanged, so behaviour on ordinary diffs is identical.
- **Packed once, outside the per-CLI map.** Every reviewer sees the same subset.
  Corroboration would mean considerably less if the CLIs had been shown
  different files, and the previous code applied the cap independently per CLI.
- **Coverage on the result and in the summary.** `coverage` is optional and
  absent when the whole diff fit, rather than defaulting to `partial: false` —
  a record written before this field existed must not read as a positive claim
  of full coverage.

`executeTriangulatedReview` has no in-repo caller; it is re-exported from
`orchestration/index.ts` as public API, so external consumers are the affected
population.

This closes the remaining half of #5301. The other site it named — the
contrarian escalation prompt in `mcp/tools/consensus-vote.ts` — was already
fixed by #5305, which introduced the shared `utils/bounded-artifact.ts` helper.
