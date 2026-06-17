---
'nexus-agents': patch
---

fix(orchestration): wire the authority-tier runtime guard into the live dispatch path (#3920)

ADR-0017's "router refusal" was dead code in production. `guardAuthority`'s only
non-test caller (meta-orchestrator `select`) is gated on
`input.requiredAuthority !== undefined`, but no production dispatch path ever set
it — `toMetaInput` omitted it on BOTH the route-only (`execute:false`) and inline
`execute:true` paths. So the `if` was always false and the runtime ceiling never
ran; only the CI declaration gate (`check-authority-tier-drift.ts`) was live.

**The wiring.** `requiredAuthority` is now derived from the DISPATCH MODE and
threaded through `toMetaInput`:

- A new pure, exported `dispatchActionClass(mode)` in `authority-tier-guard.ts`
  maps the two `run` dispatch modes to the authority class each EXERCISES.
- `run-tool.ts` passes `'route'` (from `routeGoal`) / `'execute'` (from
  `executeGoal`) so the guard fires at the router on every real dispatch.

**Refusal semantics (conservative, ADR-0017-grounded).** Both modes floor at
`suggest`: a routing recommendation is `suggest`-class by ADR definition ("inert
until a human acts"), and an inline `run` result is likewise inert (it does not
merge/deploy/gate a protected resource). Flooring at `suggest` — not `observe` —
is what gives the guard teeth without breaking parity: every live strategy is
declared `suggest`/`advisory`, so all pass. The guard refuses fail-closed
(`AuthorityRefusalError`, before any executor runs) only on a genuine above-tier
action — an `observe`-tier strategy reaching dispatch (`above_declared_tier`), or
a strategy with no declared tier (`tier_undeclared`, the runtime backstop behind
the CI gate). The `run` execute path maps the refusal to a `business`-class
structured error (a policy outcome, not an internal fault). A higher action floor
(an `advisory`/`enforce` dispatch surface) is a future, owner-approved widening
localized to `dispatchActionClass`.

**No behaviour change for correctly-declared loops.** Parity suite green; normal
suggest/advisory dispatch proceeds unchanged.

**Regression test.** `run-tool-authority-guard.test.ts` drives above-tier actions
through the REAL `routeGoal`/`executeGoal` paths (not a hand-built
`MetaOrchestratorInput`) via a deliberate-breakage manifest fixture, and asserts
refusal (route + execute) while normal dispatch proceeds — RED before the wiring,
GREEN after. This is the regression that would have caught the dead-code gap.

Left for the governance ratification vote (governance-of-the-governor): the
precise "dispatch action → requiredAuthority" mapping is the design judgment to
ratify.
