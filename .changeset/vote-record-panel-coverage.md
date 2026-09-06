---
'nexus-agents': minor
---

Vote records can now say that the panel was degraded. An errored voter was dropped from both `voters` and `voteCounts`, so a seven-role panel that lost four of them persisted as a clean three-voter record, and under `reduce_denominator` a 6-of-7 panel with one dead voter recorded as a unanimous six-voter approval. Schema 1.5 adds an optional `panelCoverage` with the requested, responded and errored counts plus the errored roles. It is folded into the self-hash only when present, so every existing record still verifies.
