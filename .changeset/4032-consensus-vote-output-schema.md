---
'nexus-agents': patch
---

Fix `consensus_vote` rejecting on strict MCP clients (`-32602 additional properties`, [#4032](https://github.com/nexus-substrate/nexus-agents/issues/4032))

`consensus_vote` returns `panelWarning` (#3587, on a degraded panel) and `costSummary`
(#3855, whenever per-decision cost recording succeeds) in its `structuredContent`, but
`CONSENSUS_VOTE_OUTPUT_SCHEMA` never declared them. A spec-strict MCP client — one that
validates the result against the advertised `outputSchema` with
`additionalProperties: false` — rejected the response on most real votes. Both fields are
now declared. The same review found a second instance of the bug class: the schema's
`decision` enum listed only `approved`/`rejected`/`no_quorum`, but the response can also
carry the reachable `timeout`/`pending` outcomes — so a timed-out vote hit the same
`-32602` rejection. `decision` now reuses a canonical `VoteDecisionStatusSchema` (the
single source the `VoteDecisionStatus` type is also derived from), making that drift
structurally impossible. The cost-summary shape is likewise captured once in a shared
`DecisionCostSummarySchema` co-located with its type. Regression guards assert the strict
output schema accepts a fully-populated response (key parity) and every reachable
`decision` value, and pin the cost schema to the `rollupDecisionCost` producer.
