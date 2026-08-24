---
'nexus-agents': patch
---

fix(observability): report the dashboard health score as unmeasured instead of a constant 0.8

`computeHealthScore` averaged four indicators, but with no recorded outcomes
three of them are defaults rather than measurements: `calculateRegret([])`
returns `optimalRate: 1`, so `isLearning` answered "yes" on the strength of no
data, and `noUnderperformers` was vacuously true because there were no
performers. `recordOutcome` has no production caller, so the score was exactly
`0.8` on every real run.

A confident number computed from nothing reads as a live signal and is harder
to distrust than an obvious gap. It now returns `null` when there is not enough
data to score, and the dashboard prints "unmeasured (not enough recorded
outcomes to score)".

Five tests in this area encoded the old behaviour, including one asserting
`healthScore >= 0 && <= 1` — true of every possible value, including the
constant. All rewritten to assert the contract in both directions rather than
deleted.
