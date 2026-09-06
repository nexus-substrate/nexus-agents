---
'nexus-agents': patch
---

The evaluation harness's `averageScore` is no longer computed over a set
selected by the score. `checkSuccess` is
`rubricScore.overallScore >= (task.minimumScore ?? 0.5)`, so filtering the score
list on `r.success` removed every sub-threshold score from the numerator and the
denominator — pinning `averageScore` at or above the pass bar however badly the
run went, so a run where 9 of 10 tasks scored 0.1 reported a better average than
one where all 10 scored 0.6. All four sites are fixed (aggregate, per-CLI,
per-category, per-difficulty). Separately, `TestRunResult.success` was
`failureCount === 0 || !stopOnFailure` with `stopOnFailure` defaulting to
`false`, so the run-level verdict was `true` for every failure count unless a
caller opted in; it now reflects the results.
