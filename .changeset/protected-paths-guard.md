---
'nexus-agents': patch
---

feat(capability-loop): protected-path / self-modification guard (#3653)

The loop may never autonomously weaken its own safety rails or touch
auth/secrets/access-control/CI (consensus-vote condition 2). Two layers:
`isProtectedPath`/`planTouchesProtectedPath` let the enforce path proactively
refuse a plan that declares a protected target (the loop's own remediation/
consensus/review modules, .rules, security/auth/secrets, CI workflows), and
CODEOWNERS is extended to require human review on consensus/ and .rules/ (on top
of the existing security/pipeline/mcp/workflows coverage) — the hard merge-time
attestation.
