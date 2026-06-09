---
'nexus-agents': patch
---

feat(list_jobs): dual-read from the Stage-2 task-state log (#3693). Completes the reader half of the sidecar→Stage-2 job-result migration (epic #2631) — `get_job_result` already dual-reads (#3094); now `list_jobs` does too. With `NEXUS_JOB_RESULT_SOURCE=task_state` it unions the task-state log with the sidecar (deduped by jobId, task-state preferred, newest-first), so no job is lost while the writer half is still partial; default (unset) stays sidecar-only and unchanged. Adds `listTaskStateIds` (task-state enumerator), `listJobsFromTaskState`/`resolveJobList` (mirroring `resolveJobResult`), a shared `toJobSummary` projection, and registers the previously-undocumented `NEXUS_JOB_RESULT_SOURCE` toggle in the env schema. Unblocks writer retirement (#3092/#3093).
