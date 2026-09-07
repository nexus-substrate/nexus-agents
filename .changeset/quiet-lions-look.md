---
'nexus-agents': patch
---

consensus: an unobserved voter pair no longer earns the maximum posterior weight (#5813)

`computeSubsetIndependence` averaged only the pairs present in the correlation matrix, so a pair that had never co-voted was dropped from the average rather than represented. A subset whose pairs were **measured** at 0 and one whose pairs were **never observed** both scored `0` — and `1 - 0 = 1` is the maximum weight `aggregateSubsets` can assign. Absent evidence was credited as evidence of independence, and it fed `posteriorApproval`.

An unobserved pair now counts as maximally correlated: the denominator is the pairs that *exist*, not the pairs that were seen. A fully unobserved multi-agent subset scores 1 and contributes nothing; a singleton keeps full weight, because it has no peer to correlate with and so nothing to discount.

Bounded by `hasSufficientData`: a panel with no correlation history takes the simple-voting path and never reaches this. Remedy chosen by a live 7-voter panel (option B, 4 of 6); the approvers were unanimous that the error to optimise against is over-weighting a secretly correlated bloc, which fabricates independent evidence, rather than under-weighting a genuinely independent voice, which shrinks as pairs are observed.
