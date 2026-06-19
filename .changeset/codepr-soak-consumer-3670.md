---
'nexus-agents': minor
---

feat(capability-loop): dry-run code-PR soak consumer in audit mode (#3670 Stage 2.5)

Wire the dry-run code-PR orchestrator (`planCodePrRun`) as a SOAK consumer of the
Stage-1 guards, driven from auto-remediation's AUDIT mode. When a code-touching
remediation plan is produced in audit mode, the cycle now runs `planCodePrRun` in
dry-run over a derived change set and records one durable guards-green-soak data
point (green on a clean plan, denied on a guard denial/error). The recorded count
is read back as the `consecutiveGreenDryRuns` evidence
`evaluateCodePrEnableReadiness` consumes — so audit mode accumulates the
guards-green-soak the enable double-gate requires.

Dry-run only: NO push, NO PR-open, NO live write (the orchestrator already
discards its throwaway worktree atomically). Best-effort: a soak-step failure is
swallowed (WARN) and never breaks the remediation cycle. Runs ONLY in audit mode;
off/enforce behavior is unchanged.
