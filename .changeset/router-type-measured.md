---
'nexus-agents': minor
---

Routing analytics no longer credit TOPSIS for decisions it did not make.
`getDecisiveRouterType` tests four stage names and, when none explains the
decision, returned `'topsis'` — byte-identical to its own measured answer — so
every unattributable decision inflated `decisionsByRouter.topsis`, the exact
number that metric exists to report. `RoutingDecision` gains an optional
`routerTypeMeasured`, `countDecisionsByRouter` excludes unmeasured rows, and
`FeedbackLoopStats` gains `decisionsUnattributed` so the excluded population is
reported rather than hidden. A row with no flag (written before this change)
reads as unmeasured, never as measured.
