---
'nexus-agents': minor
---

SICA no longer reports measurements it never took.
`VersionTestMetrics.passRate` was `result.errors.length === 0 ? 1 : 0.5` — not a
rate, and `1` whenever `validate: false` left `errors` empty by construction,
with no test process ever spawned. It is now `valid / checked` derived from the
validation tally the generator already computed and threw away, absent when
nothing was checked, and accompanied by `passRateBasis`
(`static_validation` | `unmeasured`) so a reader knows nothing was executed.
`ImprovementValidation.performanceChange` was a literal `0` on both the success
and the failure path, so it distinguished nothing; it is now optional and
omitted when no comparison ran.
