---
'nexus-agents': minor
---

feat(pipeline): add trust-tier policy enforcement at shared agent-executor stage entry (#4694)

Enforces caller trust-tier policy at `startStage` in `agent-executor.ts` across pipeline stages. Missing or unmeasured caller tiers fail closed to untrusted (`4`) in the policy snapshot. Under `NEXUS_POLICY_GATE_MODE=block`, untrusted callers are blocked before workspace execution with `PolicyBlockedError`, while benign callers (tiers 1 and 2) and analysis/planning stages continue unimpeded. Under default `warn` mode, violations are emitted to the event bus and durable audit trail (`security.policy_gate`) without halting.
