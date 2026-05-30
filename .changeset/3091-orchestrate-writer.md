---
'nexus-agents': minor
---

**feat(orchestrate):** async-mode writes results to StructuredTaskState (#3091, writer half of the #3069 sidecar→Stage-2 migration).

`orchestrate({ mode: 'async' })` now records its result into the canonical Stage-2 task-state log, so `get_job_result` resolves directly from it once `NEXUS_JOB_RESULT_SOURCE=task_state` (default still sidecar — see #3094). Completes the reader+writer pair: the dual-read is now activatable end-to-end.

What changed:

- **`jobId === taskId`.** Async dispatch now mints the jobId via the orchestration's own `generateTaskId()` and threads it through the pipeline, so the job's result lands in the task-state log keyed identically. **User-visible:** the async-mode `jobId` format changes from `job-orch-<uuid>` to `orch-<ts>-<rand>`. Callers that treat the jobId as an opaque token (the documented contract) are unaffected; only code that parsed the `job-orch-` prefix would need updating.
- **Terminal failures record stage `'failed'`** (the new stage from #3094) instead of the recoverable `'blocked'`, at both `executeOrchestration` failure sites. This applies to sync orchestrate too — its task-state log now shows `'failed'` on a hard failure (observability only; nothing gates on the prior `'blocked'`). The blocker entry (carrying the message) is unchanged.
- On completion the background run mirrors the result into task-state via `appendResult`; throws escaping the pipeline record a `'failed'` terminal stage so pollers never see a stuck `'pending'`.

Fast-path (simple) async tasks skip task-state recording and remain resolvable via the sidecar fallback. Deferred: `run_workflow`/`consensus_vote` writers (#3092), `list_jobs` dual-read (#3090), sidecar deletion (#3093).
