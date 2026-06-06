---
'nexus-agents': patch
---

fix(task-analysis): sync capability-gap-detector registry with canonical sources

The `capability-gap-detector` static registries had drifted: the tool set listed 21 names (doc-comment claimed "20") against 45 actually registered, and the expert set listed 10 against 12. A task requiring a real-but-unlisted tool/expert (e.g. `search_codebase`, `pr_review`, `qa_expert`) would be falsely reported as a capability gap. This was latent today (the routing path only requires a small fixed subset) but becomes a real defect as required-capability inference expands or as the capability-gap ledger (#3555) consumes these reports. Synced both sets to the canonical `REGISTERED_TOOL_NAMES` and `BuiltInExpertTypeSchema`, corrected the misleading doc-comments, and added freshness tests that import the canonical sources and fail CI on future drift.
