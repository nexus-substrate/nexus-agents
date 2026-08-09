---
'nexus-agents': patch
---

fix(review): wire the model adapter into PR review, and fail closed without one (#4350)

`nexus-agents review` never ran a model. Both CLI entry points called
`createPRReviewer({ dryRun })`, but the adapter is that factory's **second**
parameter — so `PRReviewer.adapter` was always `undefined`, every expert logged
`hasAdapter: false`, and each one silently fell through to its heuristic branch.
The command then printed a confident decision (`67% REQUEST CHANGES` in the report)
built from generic findings with no file, no line, no PR-specific reasoning and
`tokensUsed: 0`, and exited 0 — so automation could not tell it apart from a real
adapter-backed review. `verify` and `doctor` correctly reported three authenticated
CLIs the whole time, because they inspect the CLIs directly; the review path simply
never asked for an adapter.

Both entry points now resolve one through the canonical
`getGlobalRegistry().getDefault()` path — the same acquisition the voter CLI uses —
and **fail closed** with actionable guidance when none is configured, rather than
producing a review nobody should trust. Decided by `consensus_vote`
(`higher_order`, 7/0): a labelled "degraded mode" was rejected because the labelling
would have to survive every render path, and deleting the heuristic path outright
was rejected as a breaking library change out of scope for a bug fix. It remains
reachable for library consumers that construct `PRReviewer` with no adapter.

Also fixes a mislabelled count in the same report: the demo command's progress line
printed `expertReviews.length` (the expert count) under a "files" label, so a
7-file PR reported "3 files". `PRReviewResult` now carries `filesReviewed`.
