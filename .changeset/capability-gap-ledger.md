---
'nexus-agents': minor
---

feat(task-analysis): add CapabilityGapLedger — aggregate discarded gap reports into a build backlog

Adds `createCapabilityGapLedger()`, which aggregates the `CapabilityGapReport`s produced on every routing / MetaOrchestrator decision (currently computed and thrown away) into a frequency-ranked, deduplicated summary of the tools and experts the system keeps wanting but lacks — the substrate for a self-directed build backlog (#3555). `record()` ingests a report with optional `{goal, decisionId}` context; `summarize()` returns distinct gaps ranked by observation count (with a bounded sample of example goals); storage is bounded. `createMetaOrchestrator()` gains an optional `gapLedger` injectable that records each decision's gaps when provided (default absent — no behavior change). Later increments aggregate this and feed `suggest_research_tasks`.
