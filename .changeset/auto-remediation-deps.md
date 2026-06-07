---
'nexus-agents': patch
---

feat(capability-loop): auto-remediation deps assembly — audit-ready (#3671)

`buildAutoRemediationDeps` wires the merged adapters (deterministic research,
live-voter vote, atomic lease, audit logging) into a single AutoRemediationDeps
for runAutoRemediation. AUDIT-READY now: an audit run executes research →
consensus vote and stops before IMPLEMENT, producing the soak data the readiness
gate needs — using only merged pieces. ENFORCE stays fail-closed: `implement` is
a stub until the Option B proposal-PR adapter (#3669), the lease is null without
a configured repo/sha, and readiness defaults to not-ready.
