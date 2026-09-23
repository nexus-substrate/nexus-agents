---
'nexus-agents': patch
---

Reuse classified input for per-action policy evaluations to eliminate duplicate input-level audit events (#6310).

- Adds `evaluateAction(action, options)` and `FirewallResult.evaluateAction` to `HostileInputFirewall`, providing action-level policy re-entry without re-running extraction, sanitization, classification, or reputation gating.
- Updates `evaluateActionThroughFirewall`, `validateActionsThroughFirewall`, and `auditReviewAction` to accept `FirewallActionInput` carrying the classified `FirewallResult`.
- Ensures each triage or PR review emits input-level audit events (`security.trust_classification`, `security.sanitization`) exactly once, emitting only `security.policy_gate` per proposed action.
