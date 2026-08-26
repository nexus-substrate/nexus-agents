---
'nexus-agents': minor
---

feat(research): say how many findings a cluster actually had

`keyInsights` is capped at ten, and the cap bites: against the live registry six
of eleven clusters exceed it, `orchestration` with 55 distinct findings. A
caller saw `paperCount: 40` beside ten insights and could not tell "these are
the cluster's insights" from "these are ten of fifty-five".

`ClusterSynthesis` now carries `totalInsights`, and the CLI renderer says
`Key insights (5 of 55)` instead of `Key insights:` — three nested truncations
(55 → 10 → 5), none of which was visible before.

A bounded read is legitimate; a bounded read reported as complete is not.
