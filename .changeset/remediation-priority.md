---
'nexus-agents': patch
---

feat(capability-loop): priority→consensus-rigor policy for autonomous remediation (#3653)

The pure policy core of the owner-directed, consensus-ratified (7/7) on-by-default
autonomy work: classify every signal/gap into p0–p4 (security is always p0,
fail-closed) and map each tier to the consensus rigor required before
auto-remediation — p0 unanimous + mandatory dry-run, p1 supermajority, p2
higher_order, p3 simple_majority, p4 file-only. Single authoritative mapping
(maps to canonical ConsensusAlgorithm values); consumed next by the p0–p4
auto-filer and the enforce orchestrator's consensus gating.
