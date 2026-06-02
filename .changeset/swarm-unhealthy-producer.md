---
'nexus-agents': minor
---

feat(observability): emit signal.swarm_unhealthy from SwarmObserver health (#3223)

Adds the final producer that makes the self-tuning loop fire end-to-end. A
server-lifecycle poll reads `SwarmObserver.getHealthMetrics()` and emits
`signal.swarm_unhealthy` onto the typed pipeline bus for CLI-attributable
severe (high/critical) bottlenecks. The (shadow-by-default) TuneStage consumes
it; under `NEXUS_TUNE_ENFORCE` it applies a bounded, decaying routing demotion.
Attribution is conservative — a bottleneck only signals when its agentId
confidently resolves to a canonical CLI slot (CLI-name literal or curated model
id); role names / trace ids are skipped (debug-logged), never mis-attributed to
the opencode catch-all. Closes the observability→routing gap (#3223): rich swarm
health was previously write-only for dashboards.
