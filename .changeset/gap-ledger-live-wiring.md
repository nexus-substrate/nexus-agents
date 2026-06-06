---
'nexus-agents': minor
---

feat(orchestration): feed the capability-gap ledger from live routing traffic

Adds a process-wide `getGapLedger()` singleton (mirroring `getOutcomeStore()`) plus a `recordRoutingGaps()` helper, and wires the live `orchestrate` tool to record the capability gaps its routing decision already computes (`workflow-router.ts` had been discarding them). The gap ledger (#3555) now accumulates real signal from production routing traffic — no longer dependent on the (owner-gated) unified entry point — turning recurring "tool/expert needed but missing" gaps into a frequency-ranked, self-directed build backlog. No-op when a decision satisfied every required capability.
