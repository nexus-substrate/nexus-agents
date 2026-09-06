---
'nexus-agents': patch
---

Two governance verifiers now measure code instead of text. The claim counters (`countEnumMembers`, `countManifestTools`) strip comments before counting, so an enum member or tool entry deleted by commenting it out no longer counts as live evidence. The mock-orchestration opt-in check excludes its own source and the env schema from its scan, so the "no guard found" warning can actually fire when the guard is gone.
