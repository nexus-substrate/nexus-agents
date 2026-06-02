---
'nexus-agents': minor
---

feat(observability): emit signal.swarm_unhealthy from adapter failovers (#3321)

Adds a second, higher-reliability `signal.swarm_unhealthy` producer alongside
the SwarmObserver-bottleneck poll (#3223). `ResilientAdapter` emits
`adapter.failover` events on the collaboration bus whose payload carries the
exact `CliName` and health state on circuit-breaker trips / failovers. This
producer subscribes to that bus and re-emits `signal.swarm_unhealthy` on the
typed pipeline bus when an adapter degrades or becomes unavailable — directly
CLI-attributable, no `confidentCliSlot` guesswork. A per-CLI cooldown absorbs
breaker flapping. `api`-source and healthy events are ignored. The
shadow-by-default TuneStage consumes it; under `NEXUS_TUNE_ENFORCE` it applies a
bounded, decaying routing demotion. Bus direction is B→A, preserving the
observability/messaging boundary.
