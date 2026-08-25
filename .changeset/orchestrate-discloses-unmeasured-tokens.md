---
'nexus-agents': minor
---

stop orchestrate reporting tokensUsed: 0 as if it were a count

`createStep` and `createResult` in `orchestrator-adapters.ts` both hardcode
`0`, and `orchestrate` publishes the total straight through — so the live MCP
tool reported `tokensUsed: 0` on every run, with nothing saying whether tokens
were measured.

Threading a real count is not available here: `OrchestratorAgentLike.execute`
returns `Result<unknown, unknown>`, so no usage metadata reaches this seam at
all. The honest fix is disclosure.

`OrchestratorStep` and `OrchestratorResult` gain an optional
`tokensMeasured`, following `ResultMetadata.tokensMeasured` (#4734) and
`AggregationMetadata.confidenceMeasured` (#4831). Both are set `false` here,
the result derives its flag from its steps, and the `orchestrate` output schema
carries it so a client can tell "spent nothing" from "nobody counted".

Fixes #4829.
