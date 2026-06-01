---
'nexus-agents': minor
---

feat(pipeline): shadow-mode TuneStage closes the signal loop (consumer core, #3147)

Adds `signal.fitness_declined` / `signal.swarm_unhealthy` / `signal.vote_rejected`
to the typed `PipelineEvent` union and a `createTuneStage` consumer that maps each
signal to its bounded intended action. Ships dry-run first: it logs the intended
action and mutates nothing; `enabled=true` fails closed (no-op) because the
human-gated mutation path (#3147 PR-4) is not implemented and must not reuse the
LinUCB real-outcome channel. Producers are wired after the event-bus unification
(#3289). Unlike the removed #3022 learning.\* types, these ship WITH their consumer.
