---
'nexus-agents': patch
---

`consensus_vote` and `pr_review` run with `dispatch: "async"` now get the deadline their job allows. The panel's overall deadline used to be clamped to the sync request cap (890 s) on both paths, so an async panel lost its slowest seats to `overall consensus deadline exceeded` at the same point a sync call would, although the job itself may run for an hour. An async panel's deadline is now clamped to the `async-job-body` guard (honouring `NEXUS_TIMEOUT_CLASS_ASYNC_JOB_BODY_MS`), so the default per-seat budget (300 s per attempt, two retries) fits whole. Sync calls are unchanged (#7764).
