---
'nexus-agents': minor
---

feat(routing): BudgetRouter enforces the latency budget it has always accepted

`BudgetRouter` declared a three-part budget — tokens, cost, latency — and
enforced two. `maxLatencyMs` was Zod-validated on `BudgetConstraint`, given a
`60000` default, and copied from routing YAML by the config adapter, and read by
nothing: a grep across the router and its error/warning helpers found exactly one
hit, the default assignment. `'latency'` was a declared member of both violation
unions with no producer, so a consumer reporting "no latency violations" was
reporting the absence of a check.

`selectAdapterWithinBudget` now compares each candidate's profile latency against
the budget, `BudgetRoutingResult` carries `estimatedLatencyMs` for the selected
adapter, and `determineExceededConstraint` emits the `'latency'` violation.

Behaviour change, bounded: the fastest cost-model profile is 1000ms and the
slowest 2000ms, so the 60000ms default cannot exclude any current candidate. A
deployment that explicitly set `maxLatencyMs` below 2000 will start seeing
candidates filtered — which is what that setting always said it would do.

A candidate with no cost-model profile is admitted rather than rejected: a
latency budget must not silently exclude every model whose latency is unmeasured.
`estimatedLatencyMs` is absent rather than `0` when no adapter was selected.

Decided by consensus vote (higher_order, 5 approvers, 100% on option A —
enforce — over remove and disclose-only). Closes #4907.
