---
'nexus-agents': minor
---

`cancel_job` now stops an async `run_dev_pipeline` or `run_pipeline` job at the next stage boundary. Before this, cancelling either job marked the record `cancelled` while the pipeline kept calling stages, and so kept spending, until it finished.

- `DevPipelineOptions.signal` (new, optional): `runDevPipeline` checks the signal immediately before every stage call, including each plan/vote and implement/QA iteration. Once it has fired, the run rejects with `Dev pipeline cancelled before the <stage> stage` and no further stage runs.
- `GraphPipelineOptions.signal` (new, optional, and inherited by `AdaptiveOrchestratorOptions`): the signal is handed to the graph executor. The executor checks it before each super-step and fails the run with `Graph execution aborted`.

In both cases a stage that is already running finishes. Only the stages after it are skipped. The job record's `signalAccepted` is now `true` for both tools, and it reports only what the engines actually read. The four other `runAsJob` tools listed in #6305 still do not accept the signal.
