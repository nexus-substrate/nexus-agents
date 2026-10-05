---
'nexus-agents': major
---

Add `declared` to the published `PriceBasis` union for `NEXUS_GATEWAY_COST` rates (`priced:<in>,<out>`, `free`, `local`). Outcome records and voter/decision cost summaries now distinguish an operator's statement from a published registry rate. Bare `priced` still uses the registry, and unpriced details remain `unknown`. The declared caveat identifies the operator declaration as its source.

Consumers of `TaskOutcome`, `DecisionCostSummary`, `VoterCostBreakdown`, and `WeatherReportDeps` must handle the new member in validators, switches, and displays. Mixed decision totals retain `list` if any contribution uses a list rate; otherwise `declared` takes precedence over `unknown`, with each voter's basis preserved.

Current in-tree persisted readers share the widened schema and accept `declared`. Older readers with the two-member schema reject records containing it, potentially skipping entire JSONL decision/outcome rows; upgrade readers sharing telemetry before writing declared records. Existing records remain readable.
