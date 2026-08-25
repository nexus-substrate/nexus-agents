---
'nexus-agents': minor
---

make `consensus_vote`'s async dispatch reachable

The tool's description tells callers `Supports async mode (mode: 'async') —
returns a jobId to poll via get_job_result`, and the schema it registered with
MCP omitted `mode`, so the SDK stripped the field before the handler saw it.
Passing it produced a 78-second synchronous run with no jobId and no error.

`idempotencyKey` was omitted the same way, taking the replay-safe
"same key, same inputs returns the existing job" behaviour with it — along with
the documented `cancel_job` semantics that preserve partial votes.

The registered schema is now `ConsensusVoteInputSchema.shape` rather than a
hand-copied subset, matching `run_dev_pipeline`. The existing drift contract
exempted these two fields as "not user-facing vote inputs", which contradicted
the description; it now asserts full parity with no exemptions.

This matters most where the sync path is weakest: a 7-voter `higher_order`
panel measured 548s against the 900s MCP request ceiling, and the field's own
description recommends async for exactly that case.
