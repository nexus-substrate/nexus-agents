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

Detection is structural — `allowed === true && ruleName !== undefined`, since
`allowWithReason` never sets `ruleName` — not a match on the `[WARN MODE]`
reason prefix, which is display copy.
