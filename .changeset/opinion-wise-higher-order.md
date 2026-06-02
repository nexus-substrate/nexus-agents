---
"nexus-agents": patch
---

fix(consensus): opinion_wise now gets higher-order Bayesian aggregation (#3271)

`opinion_wise` is documented as an alias of `higher_order`, but the Bayesian/
correlation-aware aggregation was gated on the literal `'higher_order'` in two
places — so an `opinion_wise` vote silently fell through to the plain engine
with no `higherOrderMetadata` in the response. Added a shared
`isHigherOrderStrategy()` helper and used it at both the `runHigherOrderVoting`
gate and the `higherOrderMetadata` serialization, so `opinion_wise` is a true
alias. Tests assert `opinion_wise` produces `higherOrderMetadata` like
`higher_order`.
