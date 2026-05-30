---
'nexus-agents': minor
---

**feat(jobs):** dual-read job results from StructuredTaskState (#3090, reader half of the #3069 sidecar→Stage-2 migration).

`get_job_result` can now resolve an async job's result from the canonical Stage-2 `StructuredTaskState` log instead of the Stage-1 sidecar, via a new `mcp/jobs/task-state-source.ts` adapter. Flag-gated and **OFF by default** (`NEXUS_JOB_RESULT_SOURCE=task_state` to opt in), so production behavior is unchanged until the writer half (#3091) makes `jobId === taskId` real — this is the strangler-fig reader step.

Supporting schema additions (backward-compatible):

- `TaskStageSchema` gains a terminal `'failed'` stage (distinct from the recoverable `'blocked'`), so async-mode writers can record a failed run in task-state.
- `StructuredTaskState` gains an optional `createdAt`; the reducer backfills it from the `init` entry's ts and never mutates it (job-result readers need the original creation time, which `updatedAt` can't supply once a transition is recorded).

Mapping contract (consensus-voted under #3069, documented on #3090): `cancellation`→`cancelled`; stage `complete`→`complete`; stage `failed`→`failed`; else `pending`. No behavior change for existing logs; `version` monotonicity preserved.
