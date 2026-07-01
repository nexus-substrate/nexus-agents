---
'nexus-agents': minor
---

Opt the dev-pipeline plan gate into `absolute_quorum` (#4138, epic #4130). `iterative-consensus`
now defaults its vote `errorPolicy` to `absolute_quorum` (overridable per-caller), so an errored
voter — especially the contrarian — degrades the plan verdict to a recoverable `no_quorum` (which
the existing bounded `maxNoQuorumRetries` re-run-then-terminal path already honors) instead of
being silently dropped from the denominator. Day-one opt-in wiring; the global default policy is
unchanged.
