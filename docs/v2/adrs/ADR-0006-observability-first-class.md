# ADR-0006: Observability as First-Class (Event Bus + Provenance)

**Status:** Accepted
**Date:** 2026-02-08
**Deciders:** DevEx, Architect, PM

---

## Context

V1 observability is fragmented across 5 mechanisms (logger, tracer, gateway log, graph events, audit trail). A developer cannot reconstruct the full execution trace of a task. The feedback loop (outcomes → routing) is open because there is no unified event stream to subscribe to.

## Decision

**Implement a typed EventBus as a first-class primitive.** All pipeline state changes emit events. All consumers (logging, tracing, gateway, feedback loop, TUI dashboard) subscribe to the event bus instead of maintaining separate streams.

Key design choices:

1. **Fire-and-forget emission.** Event handlers must not throw. The pipeline runner does not wait for event processing.
2. **Typed events.** Every event is a member of the `PipelineEvent` discriminated union. No `unknown` payloads.
3. **Bounded buffer.** EventBus keeps the last N events in memory for query/replay. Not a persistent log.
4. **Correlation IDs.** Every event carries `taskId` and `executionId` for trace reconstruction.
5. **Provenance.** Artifacts track their creation source (stage, plugin, input artifacts) enabling "how was this produced?" queries.

## Consequences

**Positive:**

- Full task execution traces reconstructible from events
- Feedback loop closure: `stage.completed` → OutcomeStore → routing
- TUI dashboard gets live updates via subscription
- Debugging: event replay shows exact execution sequence
- Gateway transitions from custom logging to event emission

**Negative:**

- Memory overhead for event buffer
- Event schema must be maintained alongside pipeline changes
- Risk of event flooding in long-running pipelines (bounded buffer mitigates)

## Alternatives Considered

1. **External observability (LangSmith, Datadog):** Rejected. Nexus-agents is local tooling. External dependencies violate NG6.
2. **Structured logging only:** Rejected. Logs are not subscribable. Cannot close the feedback loop.
3. **OpenTelemetry traces only:** Rejected. Traces are per-request. Need per-stage events within a pipeline for fine-grained observability. However, the event bus should emit OTel-compatible spans where the tracer is configured.
