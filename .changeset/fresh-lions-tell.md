---
'nexus-agents': minor
---

Thread cache token figures into the decision-cost record (#4435)

Completes the chain the last three changes opened: the parser extracts cache tokens (#4438), the adapter response carries them (#4439), and they now reach `VoteUsage` → `AgentVoteResult` → `VoterCostInput` → `VoterCostBreakdown`. An operator reading a decision's cost record can finally see that a voter's `inputTokens: 2` sits beside 3,980 cached tokens rather than being the whole story.

Reads and writes stay separate all the way down — cache reads bill at roughly a tenth of the uncached input rate and cache writes at roughly 1.25x, so a single merged "cached" number could not be priced correctly later.

Both fields are optional and omitted when the adapter reported no cache activity, consistent with #4439: absent is not zero.

`DecisionCostSummarySchema` and the persisted store schema declare the new fields. That matters because the summary schema rides `consensus_vote`'s MCP `outputSchema` — a field the producer emits but the schema omits is a `-32602 additional properties` rejection at a strict client (#4032). The existing guard test that validates a real rollup strictly is extended to cover rollups with and without cache figures.

**`totalTokens` is unchanged** — still uncached input + output. Redefining a widely-read field is a semantics change for every existing consumer and every record already written, so it is tracked separately rather than slipped in. Cost is likewise still priced on uncached input only, per the 7/0 decision to defer registry cache-read pricing until a consumer needs it.
