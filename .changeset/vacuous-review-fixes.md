---
'nexus-agents': patch
---

fix(security): two checks from an adversarial review that could not fail

**The corroboration-rules test could not fail.** It asserted
`getCorroborationRules(action)` is `toBeDefined()`, but
`ACTION_CORROBORATION_RULES` is a total `Record<AgentActionType, ...>` — TypeScript
already guarantees a value for every key, so an action registered with `[]` passed
silently. It now asserts the rules are non-empty, with the two deliberate
exemptions (`RequestHumanApproval`, `RefuseAction`) named: requiring corroboration
in order to refuse or escalate would make refusal blockable.

**`measuredTrustTier` accepted a caller that cannot be derived from.** It gated on
`Object.keys(caller).length > 0`, but `extractCallerInfo` can return `{ sessionId }`
or `{ userAgent }` alone, and neither is an input to `deriveTrustTier`. The first
producer supplying only those would have made the `'3'` fallback read as a
measurement — reintroducing the constant this function exists to prevent. It now
gates on `transport` / `authenticated` / `clientId`.

Both were found by an adversarial review of my own self-merged work, and both are
mutation-verified: emptying `ClassifyIssue`'s rules fails the first, and restoring
the non-empty predicate fails the second.

Not fixed here: the drift tests iterate a hand-maintained action list rather than
the schema, and `HandoffMessage` is missing from both it and the citation-floor
table. That touches a governor-owned path — #4750.
