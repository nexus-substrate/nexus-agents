---
'nexus-agents': minor
---

Persist dev-pipeline plan votes through the same post-vote recorder as MCP consensus votes. Per-seat consensus outcomes, the decision cost record (including observed attempt usage), and the vote ledger share one decision ID. Pipeline stage outcomes retain their pipeline session trace IDs.

Live votes are recorded even when the dev pipeline stops after planning in dry-run mode. All-simulated panels skip durable vote, outcome, and cost records; this also fixes simulated MCP votes incorrectly writing a cost record. Quorum voids retain the existing MCP behavior of recording the vote and cost without measured consensus outcomes. The CLI vote command is unchanged.

Pipeline plan votes are recorded under a new decision gate, `dev_pipeline_vote`, so cost and token reports keep them apart from MCP `consensus_vote` calls. The consensus decision-token report stays scoped to `consensus_vote`. An MCP vote whose every seat was simulated now writes no cost record, and its response carries no cost summary. A pipeline vote in which every voter failed still ends `no_quorum`, now with the reason "vote stage errored", plus one vote-error outcome row.

The exported decision-cost gate union gains `dev_pipeline_vote`. A reader that switches over `gate` exhaustively should handle the new value.
