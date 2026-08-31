---
'nexus-agents': patch
---

fix(security): key the access-policy cache by trust boundary, not objective alone

`deriveWithTelemetry` cached derived policies under
`hashObjective(userObjective)` only — neither `trustTier` nor `mode` was part of
the key — and `getPolicyCache()` is a process-wide singleton, so one
long-lived MCP server shared derived policies across every tool call.

Both production callers pass `trustTier` explicitly, threaded from the request
context (`execute-expert.ts`, `orchestrate.ts`), so the tier genuinely varies
between calls in one process. Two calls with the same objective text and
different tiers therefore shared a policy, and the cache hit returns before any
trust or mode branch — while telemetry recorded `trustDecision: 'cache-hit'`,
making the skipped derivation look as though it had run.

`mode` is keyed for the same reason: `buildBypassPolicy` stores
`allowedTools: '*'` in `off` mode, and the enforcer short-circuits that to
allow-everything.

`objectiveHash` on the policy is deliberately unchanged — it is audit
provenance, answering "which objective produced this policy", and folding the
trust boundary into it would break that meaning and any stored record compared
against it.
