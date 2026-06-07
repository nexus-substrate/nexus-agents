---
'nexus-agents': patch
---

feat(capability-loop): wire circuit-breaker + protected-paths into the enforce orchestrator (#3653)

Activates two built safeguards inside runAutoRemediation: a tripped
RemediationCircuitBreaker aborts the run (auto-revert to off until a re-vote
resets it), and genuine remediation outcomes (PR opened = success; rejected vote
/ failed dry-run = failure) are recorded so sustained wrongness trips it. The
self-modification guard now refuses, fail-closed, any plan whose declared targets
hit a protected path (the loop's own rails / consensus / .rules / CI / security /
auth / secrets) — a correct decline, neutral for the breaker.
