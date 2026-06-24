---
'nexus-agents': patch
---

Fix `consensus_vote` rejecting on strict MCP clients (`-32602 additional properties`, [#4032](https://github.com/nexus-substrate/nexus-agents/issues/4032))

`consensus_vote` returns `panelWarning` (#3587, on a degraded panel) and `costSummary`
(#3855, whenever per-decision cost recording succeeds) in its `structuredContent`, but
`CONSENSUS_VOTE_OUTPUT_SCHEMA` never declared them. A spec-strict MCP client — one that
validates the result against the advertised `outputSchema` with
`additionalProperties: false` — rejected the response on most real votes. Both fields are
now declared. The cost-summary shape is captured once in a shared
`DecisionCostSummarySchema` (co-located with the `DecisionCostSummary` type), and a
regression guard test asserts the strict output schema accepts a fully-populated response
so the schema can't silently drift from the response type again.
