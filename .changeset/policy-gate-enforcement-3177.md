---
'nexus-agents': patch
---

feat(pipeline): enforce policy at the stage boundary (#3177)

Wire the previously no-op policy gate handler (`plan-compiler.createGateHandler`) to
the canonical `evaluatePipelinePolicy` evaluator. When a `PlanCompileOptions.policyEnforcement`
bundle is supplied, each gate node now evaluates its rules at runtime:

- WARN mode (the gate-enforcement default) logs violations + emits a `policy.evaluated`
  event but does not halt — a stage with no trust metadata is not blocked out of the box.
- BLOCK mode (opt-in via `NEXUS_POLICY_GATE_MODE=block` or an explicit `mode`) throws a
  new, exported `PolicyBlockedError` (carries the gate id + violations) on denial.
- OFF mode skips evaluation entirely.

A policy block is a terminal, non-retryable `permission` failure: the executor flags the
failed node `policyBlocked`, and `PipelineRunner.toResult` halts the pipeline even under
`continueOnFailure`. `escalate` gates are treated as `block` (fail-closed); true HITL
escalation is deferred to a follow-up. Gates remain no-op passes when no enforcement bundle
is provided (back-compat).
