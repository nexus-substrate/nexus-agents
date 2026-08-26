---
'nexus-agents': patch
---

fix(observability): stop a non-auditable fitness result emitting a below-floor signal

`emitFitnessDeclinedSignal` gated only on `audit.score >= fitnessFloor`. Its
sibling `detectFitnessSignals` has refused `auditable === false` since #3621 —
the not-source-repo sentinel carries a meaningless score of 0, which is "could
not audit", not "fitness is low" — and both are handed the same audit object.

So `improvement_review` run from the global npm install, where the bundled
`src/` lacks `cli-adapters/`, emitted `signal.fitness_declined { score: 0,
floor: 90 }` onto the pipeline bus, and `tune-stage` turned that into a
"fitness 0 below floor 90" tech-debt flag for a repo that was never audited. The
response payload carries no fitness field, so the fabricated signal was
invisible at the tool boundary.

The rule now lives in one exported predicate, `isAuditableScore`, that both
consumers call, so they cannot drift apart again.
