---
'nexus-agents': patch
---

run_dev_pipeline: an async run that did not complete is recorded as a failed job (#5888)

`runAsJob`'s fail-closed check inspects the ToolResult's **root** keys only — `isError`, `ok`, `success` — and deliberately so: a deep scan would read a vote whose *decision* is reject as a failed job. `toolSuccessStructured` nests everything under `structuredContent`, so `completed: false` never reached the check and a rejected pipeline was recorded `complete` — the branch `get_job_result` documents as "read `result`, not `error`". `pipeline-tool.ts` and `run-graph-workflow.ts` both hoist their verdict for exactly this reason, and `run_dev_pipeline` was the one `runAsJob` caller that did neither.

A **dry run** and a **harness run** are `completed: false` by request rather than by fault. `dryRun` already carried a marker saying so; harness mode did not, and had to gain one — without it the guard cannot tell a deliberate stop from a failure, which is the same defect one layer down. `DevPipelineResult.harnessMode` mirrors `dryRun`, and `buildStructuredOutput` surfaces it.

Not fixed here, and tracked separately: a hoisted failure's *reason* does not reach `record.error`. `runAsJob` looks for a root `error`/`message`, and `toolStructuredError` carries the message in `_meta`, so the record names which key tripped but not why. That gap is shared with the two sibling callers that already hoist.
