---
'nexus-agents': patch
---

docs(governance): the token→USD canonical row is no longer UNRESOLVED (#5122)

The canonical-paths table said **UNRESOLVED — eight paths**, and told readers to
prefer `computeCostDetail` until the pilot landed. It has landed.

The audit found eleven implementations, not eight; the #5123 ratchet then found a
twelfth (#5186) the audit had missed. All of them now route through
`learning/token-cost-core`, and the ratchet reports **0 outstanding alternates**
with CI failing on a new one.

The row names `computeTokenCost` — the arithmetic — and states the shape the
ratifying panel chose: unpriced POLICY stays in named wrappers rather than
becoming a flag on one function, because a policy enum makes picking the wrong
one a one-character mistake that typechecks and ships green. The three policies
remain `resolveCliCostPer1M` (conservative, for budget filtering),
`calculateCost`/`estimateRegistryCostUsd` (fail-closed `undefined`, for
ceilings), and `computeCostDetail` (`priced: false`, for the ledger).

Governance-path change: requires owner ratification, not self-merge.
