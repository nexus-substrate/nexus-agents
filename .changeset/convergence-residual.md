---
'nexus-agents': patch
---

fix(observability): the convergence score's second empty case (#5255 follow-up)

#5264 made `calculateConvergenceScore` return `null` for an empty feature map and
left a second empty case three lines below it:

```ts
for (const weights of Object.values(featureWeights)) {
  if (weights.length < 5) continue;      // <- every feature can be skipped
  ...
}
if (variances.length === 0) return 0;     // <- still fabricating
```

A **non-empty** feature map whose features all have fewer than 5 recorded weights
skips every iteration, leaving `variances` empty. That is the state of a learning
loop during its first four decisions — so the case is not exotic, it is the one
the metric passes through on the way to being measurable.

`0` there reads as *worst-possible* convergence, and `Math.exp(-avgVariance)`
only ever approaches 0, so a literal 0 could not have been a real reading. Now
`null`, matching the case above it.

**Three tests pinned this**, including two named `returns 0 when all features have
< 5 weights` and `returns 0 when only feature has fewer than 5 values`.

One of them was mine: #5264's control asserted `calculateConvergenceScore({ f: [1,
1, 1] })` was `not.toBeNull()` — three weights, under the threshold, so it passed
on the fabricated `0` rather than on a measurement and could not have
distinguished a working measured path from `return 0`. It now uses five weights
and asserts the exact value.
