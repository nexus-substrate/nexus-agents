---
'nexus-agents': patch
---

fix(pipeline): remove the dead `reinforcePlanBeliefs` no-op (#3465)

`reinforcePlanBeliefs` (#1720) reinforced/weakened a `plan-approach:<task>` belief
that was never `retain`ed, so the call had been a silent no-op since it landed.
Removed it: the functional plan-learning channel is `HindsightRecord`s (written by
`applyPipelineHindsight`, read into plan/vote by #3257), making the never-wired,
task-specific belief path redundant dead code. No behavior change.
