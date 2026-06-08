---
'nexus-agents': patch
---

Migrate the remaining heavy pipeline tools to async job-mode (#3732, final child
of epic #3729). `execute_spec`, `run_graph_workflow`, and `run` (the
`execute: true` path) now accept `dispatch: 'async'`, which returns a
`{ status: 'pending', jobId }` envelope immediately and runs the (long) body in
the background via the shared `runAsJob` helper — poll `get_job_result({ jobId })`
for the result. Sync (default) behavior is byte-identical. Fresh job ids are
minted per tool (`es-`/`gw-`/`rn-`); each is registered in `DEFAULT_JOB_CAPS`
(cap 2) and `TOOL_NAME_BY_PREFIX`. For `execute_spec` and `run_graph_workflow`
`dryRun`/`list` short-circuits stay sync; `run` async applies only to
`execute: true` (read-only routing is unaffected).
