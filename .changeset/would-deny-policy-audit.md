---
'nexus-agents': major
---

feat(audit)!: record warn-mode policy near-misses as `would_deny` (#4991)

**BREAKING:** `PolicyDecisionAuditOpts.decision` widens from `'allow' | 'deny'`
to the new exported `PolicyAuditDecision` = `'allow' | 'deny' | 'would_deny'`.
Additive for callers; **breaking for implementors of `IAuditLogger`**, who can
now receive a third value.

Implementors will NOT get a compile error. TypeScript's method-parameter
bivariance means an implementation typed against the old union still
type-checks, then receives `would_deny` at runtime and falls through whatever
its `decision === 'deny'` branch does. The major bump is the only signal. If you
implement `IAuditLogger`, handle `would_deny` explicitly.

**Why.** In warn mode `PolicyFirewall.handleDenial` allows the call but a rule
fired. `checkPolicy` returned a result only on a real denial and the chain emit
was gated on that result, so a would-be denial produced one ephemeral
`logger.warn` and nothing durable. A reviewer running `verify_audit_chain` over
the warn-mode soak saw a clean chain and would conclude no rules fired — and
#4988's enforce decision is read from exactly that window. The instrument could
not represent what it measured.

Recording it as `deny` was not an option either: that asserts an enforcement
that never happened. `would_deny` is a distinct value so a downstream consumer
alerting on `deny` does not fire on a near-miss.

Also fixed, and not previously noted on the issue: `logPolicyDecision` derived
**two** fields from `decision` by ternary. A third value fell through to
`severity: 'info'` (understating the signal) _and_ `outcome: 'denied'` — the
chain asserting a call was blocked when it ran. Both are now an exhaustive
switch with a `never` check, so the next verdict is a compile error rather than
a silent mis-mapping. `would_deny` maps to `warning` + `success`: `outcome`
describes what happened to the operation, and the call did run.

Detection reads a new explicit `PolicyDecision.overriddenByWarnMode` flag, set
by the evaluator, which is the only place that knows the mode overrode a
denial. An earlier revision inferred it from `allowed === true && ruleName !==
undefined` and a consensus panel rejected that at the unanimous bar: naming the
rule that _permitted_ an action (`admin-override` vs `default-allow`) is
ordinary access-control practice, so the day an allow rule sets `ruleName`,
every authorized call it covered would have been recorded as a near-miss — and
#4988 would read those as evidence for enforcing. A verdict derived from the
absence of an unrelated field is a coincidence, not a signal.

`PolicyDecision` gains one optional field, which is additive; the major bump is
driven solely by the audit decision union.
