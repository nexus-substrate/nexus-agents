---
'nexus-agents': major
---

feat(observability)!: dashboard metrics report `unmeasured` instead of fabricating a perfect score (#5255)

**BREAKING.** Nine published fields widen from `number`/`boolean` to
`number | null` / `boolean | null`. External readers get a compile error at
upgrade rather than a silently wrong value.

## Why

Nothing writes the dashboard's three ingest fields — `recordOutcome`,
`recordExplorationRate` and `recordFeatureWeights` have **zero production
callers**, and `validation-dashboard-command.ts` constructs an empty instance and
renders it. So every metric was computed over an empty collection and returned
its empty-case default as though it were a measurement:

```
Total Decisions: 412
Optimal Decision Rate: [████████████] 100.0%
Cumulative Regret: 0.00
✓ Minimum Data
```

A perfect routing record over zero comparable decisions, on the observability
surface for the loop that has been enforce-by-default since v2.96.

#4714 diagnosed this correctly in a comment and fixed only the aggregate
`healthScore`. Its guard keys on `outcomes.length >= 100` — a **different**
collection from the one the broken metrics read — so on a live system the guard
passed and the fabricated values flowed through anyway.

## The null semantics, per metric

`null` means UNMEASURED — the input collection was empty. It never means zero.

| field | `null` when | previously returned |
| --- | --- | --- |
| `optimalRate` | no comparable decision | `1` → "100.0%" |
| `cumulativeRegret` | no comparable decision | `0` → "0.00" |
| `avgRegret` | no comparable decision | `0` |
| `explorationRate` | no exploration recorded | `0` → "0.0%", indistinguishable from a real greedy policy |
| `convergenceScore` | no feature weights recorded | `0` → "0%", which read as *worst-possible* convergence |
| `isLearning` | its inputs are unmeasured | `true`, on the strength of no data |
| `healthyExploration` | no exploration recorded | `false` — a health *failure* asserted from absence |

`totalDecisions` and `suboptimalDecisions` stay numeric: `0` is the true count.
It is the ratios over that count that are unmeasured.

`computeHealthScore` now also returns `null` when any component indicator is
unmeasured, closing the #4714 gap.

## Migration

A reader of these fields must handle `null`. The renderer's own treatment is the
reference: print `unmeasured (nothing recorded)` rather than formatting the
value. Do **not** coerce with `?? 0` — that reintroduces the exact defect.

## Scope

This stops the fabrication. It does **not** make the dashboard work: the
recorders still have no producer, so in practice every metric now reports
`unmeasured`. Wiring is tracked separately in #5259 with its unblock trigger.
Ratified unanimously (6/6) on #5255.
