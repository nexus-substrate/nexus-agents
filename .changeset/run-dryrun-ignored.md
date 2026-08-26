---
'nexus-agents': patch
---

fix(run): honor dryRun instead of implementing for real

`run({ goal, forceStrategy: 'dev-pipeline', execute: true, dryRun: true })`
decomposed, implemented, QA'd and security-scanned the goal. `runDevPipelineForGoal`
parsed `dryRun` into an input object that only `createStages` reads, then built
the pipeline options from `trustTier` alone — so the dry-run short-circuit never
fired. The direct `run_dev_pipeline` handler forwarded it correctly, which is
what made this an asymmetry rather than a missing feature.

Wiring it exposed the other half. `buildDryRunResult` returns `completed: false`
by design, and `run`'s engine-failure check reads `completed === false` as a
fault — so a successful dry run would have come back as
"Engine reported failure: the run stopped before the security gate", with the
plan buried in `detail` and the job marked failed on the async path. The result
now carries `dryRun: true` to say WHY completion is false, and the check exempts
it — except when the planner returned nothing, which is still a failure.
