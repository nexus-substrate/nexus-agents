---
'nexus-agents': patch
---

feat(pipeline): make retryFailed selective + retryability-gated (selective-retry slice 3)

`PipelineRunner.retryFailed` now replays prior successful nodes (via the slice-2
`priorResults` executor option) so only the failed nodes and their dependents
re-run, and it only retries when at least one failure is `isRetryable` (transient)
— permanent failures (validation/permission/business/internal) no longer trigger
a pointless re-run. `PipelineResult` gains optional `nodeResults` (the raw results,
carrying the retryability signal). Back-compat: a result without `nodeResults`
falls back to the prior whole-pipeline retry. Completes #3534 (#3531).
