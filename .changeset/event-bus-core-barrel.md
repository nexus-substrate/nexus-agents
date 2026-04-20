---
'nexus-agents': minor
---

refactor: expose event-bus via core/event-bus re-export barrel

Adds `src/core/event-bus.ts` as a stable import path for the event-bus
so cross-cutting subsystems (adapters, consensus, pipeline) can wire
into it without crossing the agents-layer boundary flagged by the
fitness-audit `layerSeparation` check.

- **New**: `src/core/event-bus.ts` re-exports the public surface from
  the existing implementation in `src/agents/collaboration/event-bus*`
- **Migrated**: 2 layer-crossing imports in `resilient-adapter.ts` and
  `weighted-voting.ts` now use the new path
- **No breaking change**: the implementation files stay put; the
  35+ existing importers at the old path continue to work
- **Physical move** is v3.0-gated (#2066) — internal
  `event-bus-events.ts` has coupling to `collaboration-types.ts` that
  must be decoupled first

## Fitness impact

Score: **99 → 100**. The \`layerSeparation\` dimension now reports 0
adapter→agent import violations (was 2).
