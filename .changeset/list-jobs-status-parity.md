---
'nexus-agents': patch
---

`list_jobs` now reports the same status for a job as `get_job_result`.

- With `NEXUS_JOB_RESULT_SOURCE=task_state`, the two tools now decide between the sidecar record and the task-state log with the same rule. Before, `list_jobs` always took the task-state record, so a job with a finished sidecar and a task-state log still in progress was listed as `pending` while `get_job_result` reported it `complete`. One example is an `orchestrate` job that returned a partial result after its overall deadline. `list_jobs({ status: 'complete' })` left such jobs out.
- Each `list_jobs` summary now carries `abandoned: true` when a `pending` job has outlived the runaway guard, using the same check `get_job_result` uses. Before, the list showed such a job as plain `pending` for up to seven days. Abandoned jobs still match `status: 'pending'`. A new optional `abandoned` filter returns only abandoned jobs (`true`) or excludes them (`false`).
- The exported `JobSummary` type gains the optional `abandoned` field, and `ListJobsInputSchema` gains the optional `abandoned` input.
