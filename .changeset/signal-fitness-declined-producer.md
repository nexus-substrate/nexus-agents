---
'nexus-agents': minor
---

feat(improvement-review): emit signal.fitness_declined to close the tune loop (#3147)

Second `signal.*` producer per the #3289 narrow-merge scope: when the
`improvement_review` MCP tool's fitness audit falls below the governance floor,
it emits `signal.fitness_declined` (score, floor, worst-offending dimension)
onto the typed pipeline bus, where the shadow TuneStage consumes it
(`flag_tech_debt`). Emitter lives at the MCP layer (server context, live
consumer) to keep `governance/fitness-score` decoupled from the bus
(A=observability / B=messaging).
