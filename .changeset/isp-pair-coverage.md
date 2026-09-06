---
'nexus-agents': minor
---

An independent-subset's independence score now travels with how much of the
subset it was measured over. `computeSubsetIndependenceScore` averages only the
pairs present in the correlation matrix, so a pair that has never co-voted is
dropped from the average rather than represented — a subset whose pairs were
measured at 0 and one whose pairs were never observed both score 0, and 0 earns
the maximum posterior weight. `IndependentSubset.pairCoverage` reports
`{ observed, total }` so the two are distinguishable. Separately,
`downweightedAgents` was pushed for every singleton — subset cardinality, not
weight — so it named agents carrying a per-vote multiplier of exactly 1; it is
now measured as `weight < voteCount`, matching what the opinion-wise path does
with the same field.
