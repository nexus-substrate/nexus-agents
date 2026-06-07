---
'nexus-agents': patch
---

feat(capability-loop): wire Option B proposal-PR adapter into the deps builder (#3669)

`buildAutoRemediationDeps` now wires the real `implement` to the Option B
proposal-PR adapter (isolated worktree + secret-scan + draft PR) when both a
`repo` slug and a `repoRoot` (live checkout) are configured. Otherwise `implement`
stays a rejecting stub — so enforce is fail-closed until deliberately configured.
Completes #3669: the auto-remediation path can now produce consensus-approved
proposal PRs under `NEXUS_AUTO_REMEDIATE=enforce` (still owner-gated + readiness-
gated). The audit soak remains the next operational step.
