---
'nexus-agents': patch
---

pipeline: `run_pipeline` gains async job-mode (#3730). A new `dispatch: 'async'`
input returns `{ status: 'pending', jobId }` immediately and runs the multi-stage
adaptive orchestrator in the background via the shared `runAsJob` helper; poll
`get_job_result({ jobId })` for the result. `dispatch: 'sync'` (default) is
byte-identical to prior behavior; `dryRun` always stays sync. async jobs mint an
`rp-<uuid>` jobId (run_pipeline has no sessionId surface) and are capped at 2
concurrent runs. Mirrors the `run_dev_pipeline` migration (#3726).
