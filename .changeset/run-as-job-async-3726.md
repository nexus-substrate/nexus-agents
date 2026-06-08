---
'nexus-agents': patch
---

feat(jobs): shared `runAsJob` async-job helper + `run_dev_pipeline` async mode (#3726, epic #3729)

Extract the async-job dispatcher that orchestrate, run_workflow, and consensus_vote
implemented verbatim (idempotency resolve → concurrency cap → pending record →
detached run with complete/failed + slot release → pending envelope) into a single
`runAsJob` helper (`src/mcp/jobs/run-as-job.ts`). The three tools now delegate to it
with no behavior change (existing suites green).

`run_dev_pipeline` gains an opt-in `dispatch: 'async'` mode (default `sync`): a real
run can exceed the 900s synchronous MCP request timeout, so async returns a
`{ status: 'pending', jobId }` envelope immediately and runs the pipeline in the
background (poll `get_job_result`). `dryRun` always stays sync. When a `sessionId` is
provided the jobId is that sessionId (task-state resume); reusing it with different
inputs surfaces the existing idempotency collision envelope instead of silently
returning another run's data. Added `run_dev_pipeline` to the per-tool job caps (2)
and the jobId-prefix→toolName map (`dp`).

Interim mitigation (#3729): `pr_review`, `supply_chain_tradeoff_panel`, `execute_spec`,
and `run` were on the 60s default MCP timeout and failed at 60s; bumped to the 900s
per-tool ceiling until durable async migration lands (#3730-3732). Sync long-running
tools now append a discoverability hint pointing at async mode when they time out.
