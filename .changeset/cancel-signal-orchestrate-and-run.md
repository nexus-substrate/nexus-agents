---
'nexus-agents': minor
---

`cancel_job` now stops an async `orchestrate` job or an async `run { execute: true }` job. Before this change, cancelling either one marked the record `cancelled` while the work kept running, and kept spending, until it finished.

- `orchestrate`: the pipeline checks the signal before worker dispatch, and again before the reflection call and the orchestrator run. A cancel that lands at either point rejects with `Orchestration cancelled before the <stage> stage`. A stage that is already running is not interrupted. That gap is tracked in #6680.
- `run`: the signal is checked before dispatch and then passed to the selected strategy's engine. The dev pipeline checks it before every stage, the adaptive pipeline (`pipeline` and `research`) before every super-step, and a consensus vote before it launches each voter. Once the engine returns, the signal is checked again, so a cancelled run fails with `run cancelled during the <strategy> strategy` and never hands back a partial vote as a verdict. The `graph-workflow`, `spec`, `orchestrate` and `single-shot` strategies have no `run` executor, so they are refused before any work starts.

The job record's `signalAccepted` is now `true` for both tools. All ten `runAsJob` tools now accept the signal.
