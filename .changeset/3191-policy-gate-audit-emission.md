---
'nexus-agents': patch
---

feat(security): policy-gate can emit decisions to an audit trail (#3191, #3144 P0)

`evaluatePolicy` accepts an optional `auditTrail` and, when supplied, emits a `policy_gate` audit event (actionType, allowed, requiresApproval, inputTrustTier, violationRules) via the existing `emitPolicyEvent`. Previously policy decisions left no audit record. Optional + additive — pure callers pass no trail and incur zero side effects; existing call sites are unchanged. Foundation for the durable audit/tune substrate (#3146).
