---
'nexus-agents': patch
---

feat(capability-loop): circuit-breaker for autonomous remediation (#3653)

A `RemediationCircuitBreaker` that trips to off after K consecutive rejected/failed
remediations (default 3); a success resets the streak but does NOT un-trip — only
`reset()` (wired to a consensus re-vote) does. Bounds _sustained wrongness_ that
the rate cap + runaway guard don't catch. Pure/in-memory singleton; the enforce
entry point consults `isTripped()` to auto-revert to off and files a p1 on trip.
