---
'nexus-agents': patch
---

Remove three multi-CLI orchestration strategies that nothing called: `executeTriangulatedReview`, `executeParallelExploration` and `executeConsensusPlan`, along with their config schemas, default-config factories and result types. None was on the published API surface, and no MCP tool, CLI command or pipeline stage dispatched to them. Multi-CLI review and planning remain available through `consensus_vote`, `pr_review` and `run_dev_pipeline`.
