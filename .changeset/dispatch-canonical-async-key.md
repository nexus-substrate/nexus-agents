---
'nexus-agents': minor
---

`dispatch` is now the async-dispatch parameter on every async-capable MCP tool (#4968). Send `dispatch: 'async'` to `consensus_vote`, `run_workflow`, `orchestrate`, `run_dev_pipeline`, `run_pipeline`, `run`, `pr_review`, `execute_spec`, `supply_chain_tradeoff_panel` or `run_graph_workflow` to get `{ status: 'pending', jobId }` back immediately; omit it (or send `'sync'`) to run inline as before.

The three tools that spelled the switch `mode` — `consensus_vote`, `run_workflow`, `orchestrate` — still accept `mode: 'async'` as a deprecated alias: the call runs exactly as it did, and the result carries a deprecation warning in `_meta['nexus-agents/warnings']` naming `dispatch`. Sending both `dispatch` and `mode` with different values is a validation error. `mode` is removed from these three in the next major (#6225).

On the seven tools whose switch was already `dispatch`, a `mode: 'async'` (or `'sync'`) argument is now rejected with an error that names `dispatch`. Previously the unknown key was stripped and the tool ran synchronously with no indication — the trap that motivated the change. `run_dev_pipeline`'s own `mode: 'autonomous' | 'harness'` is unchanged; only the two dispatch values trip the new error there.

The `get_job_result` parameter description and the async concurrency-cap ("busy") hint now name `dispatch` where they named `mode`.
