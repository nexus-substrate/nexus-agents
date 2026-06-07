---
'nexus-agents': patch
---

chore(pipeline): remove orphaned runResearchPipeline subsystem (#3492)

Removes the dead `runResearchPipeline` lineage (#1711): `research-pipeline.ts` + its test, the no-op `RESEARCH_PIPELINE_PLUGIN` and its `CORE_PLUGINS` entry, and the `pipeline/index.ts` exports. It had zero runtime call sites, its only consumer (the `research` pipeline template) was retired in #3488, and the capability is served by the AdaptiveOrchestrator templates + the MetaOrchestrator `research` strategy (routes to `run_pipeline`). Decided by consensus_vote (higher_order, 5/0 REMOVE). If a distinct research pipeline is wanted later, rebuild against the current architecture.
