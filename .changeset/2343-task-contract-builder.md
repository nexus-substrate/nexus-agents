---
'nexus-agents': patch
---

Extract `buildBaseTaskContract` shared by `v2-orchestrate` and `v2-delegate` (#2343).

Both V2 MCP entrypoints had near-identical converters: the same id template, same `'approved'` status, same empty-default constraints/capabilities/capability-gaps/artifacts, same timestamps. Only the id-prefix, analysis summary, and metadata differ.

Extracted the shared scaffolding to `pipeline/task-contract-builders.ts`. Each call site now supplies only the fields that genuinely differ. Adding a new field to `TaskContractSchema` requires updating one place rather than two.

No behavior change. 32 v2 tests still pass; 7 new builder tests added.
