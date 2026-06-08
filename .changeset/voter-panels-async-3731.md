---
'nexus-agents': patch
---

feat(mcp): add async job-mode dispatch to pr_review + supply_chain_tradeoff_panel (#3731)

Both tools run 5-7 live LLM voters via `collectRealVotes` (same shape as the
already-async `consensus_vote`), and previously could exceed even the interim
900s per-tool cap. They now accept `dispatch: 'async'`, mirroring `consensus_vote`:
the sync (default) path is byte-identical, while `dispatch: 'async'` routes the
panel body through the shared `runAsJob` helper and returns
`{ status: 'pending', jobId }` immediately (mint `pr-<uuid>` / `sc-<uuid>`,
no sessionId/idempotency surface). Poll `get_job_result({ jobId })` for the
result. Sync error/timeout envelopes now carry an async-retry hint. Adds both
tools to `DEFAULT_JOB_CAPS` (cap 2 each) and the jobId-prefix → toolName map.
