---
'nexus-agents': patch
---

fix(mcp): declare research_query's rejectionNotice

`ResearchQueryResponse` carries a fourth key, `rejectionNotice`, set by
`handleStatus` and `handleOverlap` when a technique has a recorded rejection
(#4555). The `outputSchema` declared only `action`, `success` and `data`, and
the MCP SDK applies `additionalProperties: false` — so any `research_query` call
with `action: 'status'` or `'overlap'` on a rejection-carrying `techniqueId`
failed `-32602` on an SDK-validating client.

Second instance of the #5134 class, and it hid the same way: the round-trip
check calls `research_query` once with `action: 'stats'`, which never sets the
field. A single fixed call cannot cover a response whose shape varies by branch
or by data.

Adds a deterministic key-set parity test, matching the one added for
`research_synthesize` — it compares the declared schema against the response
type with no data and no action branch, in both directions.
