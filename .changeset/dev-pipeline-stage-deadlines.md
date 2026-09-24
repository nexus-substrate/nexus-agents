---
'nexus-agents': minor
---

`run_dev_pipeline` now honors `timeoutMs`. Each stage runs under a deadline, and a stage that runs past its deadline has its model calls aborted.

- `timeoutMs` is a deadline for EACH stage call, not a budget for the whole run. Every plan/vote and implement/QA iteration gets its own deadline. The tool accepted this field before but never read it, and `runDevPipeline` had no per-stage deadline at all. It now applies to every stage, the vote included, and is clamped to the `pipeline` operation-class guard.
- If you don't set `timeoutMs`, the vote stage runs under the `multi-llm-panel` class guard (900 s), which fits a full 7-seat panel. Every other stage runs under the `pipeline` class guard (1800 s). `NEXUS_TIMEOUT_CLASS_*_MS` and `NEXUS_TIMEOUT_MULTIPLIER` adjust both. The longest stage default is below the `async-job-body` guard, so on an async run a stuck stage fails with its own timeout before the whole-job guard ends the job.
- A stage that runs past its deadline fails the run with `Dev pipeline <stage> stage timed out after <ms>ms`. An implement call that times out is recorded as a failed task, and the other tasks continue. The stage's signal is aborted with a `TimeoutError` reason, so the CLI subprocess or the voter seats stop. A `cancel_job` now also aborts the stage that is running, not just the stages after it.
- An aborted expert call is no longer recorded as the model's failure.
- The research, quality-gate and security-scan stages do not yet pass the signal to their underlying work (#6747). They still fail at the deadline.
- New optional API:
  - `DevPipelineOptions.stageTimeoutMs`.
  - A trailing `signal?: AbortSignal` on every `DevPipelineStages` method.
  - `executeExpert(..., { signal })`.
  - `CompositeRouter.executeTask(task, options?)` and `executeDecision(decision, task, runTask?, options?)`, which pass `ExecutionOptions` to the routed adapter.
