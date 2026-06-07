---
'nexus-agents': patch
---

feat(capability-loop): auto-remediation cycle entry point — audit-runnable (#3671)

`runAutoRemediationCycle` is the surface a CLI / MCP tool / scheduled job calls:
resolve the env mode (NEXUS_AUTO_REMEDIATE), and — unless off — collect
improvement_review signals and run them through runAutoRemediation. OFF-BY-DEFAULT
(short-circuits before even collecting signals when unset). In `audit` it produces
the vote/plan soak data end-to-end with zero writes (deps' implement fail-closed
until #3669); `enforce` stays structurally unavailable until the Option B adapter

- real readiness land. Signal source + deps are injectable for tests.
