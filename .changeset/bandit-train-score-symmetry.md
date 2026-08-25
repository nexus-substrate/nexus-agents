---
'nexus-agents': patch
---

update the LinUCB bandit with the feature vector it selected with

A regression from the previous release. Giving the select path a real
`budgetUtilization` left the outcome path on the `0.5` neutral default, so with
a cost ceiling configured the bandit was fit against a constant column and then
scored against a varying one — `θ_budget` biased every arm's estimate by a
different amount depending on its observation count. Before that change both
sides were `0.5`: the dimension carried no information, which was the thing
being fixed; afterwards it carried misinformation.

`checkBudget` is a pure function of the task and the constraint, so the outcome
path now recomputes the selection-time value rather than caching a context
across the request boundary. The formula lives in one place both paths call,
because two call sites deriving the same feature independently is how this
drifts again.

Only reachable with a cost ceiling set (`--max-cost-usd`, or the `budget:`
block that ships commented out) — with no ceiling both paths were already on
the same default.
