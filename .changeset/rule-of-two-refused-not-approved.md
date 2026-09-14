---
'nexus-agents': patch
---

A Rule-of-Two violation in the security policy gate is refused, never routed to human approval (#4735, panel option A). When an agent simultaneously processes untrusted input (Tier 3+), has write access, and holds a secret/token, `evaluatePolicy` returns `allowed: false` with `requiresApproval: false`, as it always did; what changes is the `RULE_OF_TWO` violation message, which now names all three legs (including the input's tier) and the remedy, dropping a leg: dry-run, run without the token, or split the agent. Callers that log the violation message therefore carry the diagnosis without any new logging dependency.
