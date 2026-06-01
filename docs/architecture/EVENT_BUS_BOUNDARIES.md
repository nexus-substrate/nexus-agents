# Event Bus Boundaries

Nexus-agents has **two** event bus implementations, kept deliberately separate.
This document records that boundary as an intentional architectural decision
(consolidation epic #3288, item #3289, scope Option 2) so the two are not
mistaken for redundant implementations to be merged.

## The two buses

| Bus                   | Module                                                    | Role                                     | Semantics                                                                                                                                        |
| --------------------- | --------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A — Observability** | `pipeline/event-bus.ts` (`getPipelineEventBus`)           | Typed pipeline telemetry, query, metrics | Discriminated-union `PipelineEvent`, **synchronous** emit, bounded `CircularBuffer` history, typed-filter query. No topics, wildcards, or async. |
| **B — Messaging**     | `agents/collaboration/event-bus.ts` (`getGlobalEventBus`) | Agent-to-agent pub/sub coordination      | `DomainEvent` envelope, **topic-pattern + wildcard** subscription, `emitAsync`, correlation IDs, history.                                        |

`core/event-bus.ts` is a **pure re-export** of bus B under a stable import path
— not a third bus. Two bridges (`pipeline/event-bus-bridge.ts`,
`mcp/eventbus-bridge.ts`) translate between A and B where a cross-layer hop is
genuinely required.

## Why they stay separate

They serve different concerns. A is a **typed observability surface**:
producers emit strongly-typed events that consumers query for metrics and
self-tuning. B is a **messaging substrate**: agents subscribe to topic
patterns and receive asynchronous, correlated domain events.

A full merge was evaluated and rejected for the near term (the #3289
confirmation vote came back 12-0 substantive across two runs):

- Bus B has 27 consumers that depend on topic-wildcard subscription,
  `emitAsync`, and the `DomainEvent` envelope — none of which bus A provides.
  Forcing them onto A would be a capability regression, not a consolidation.
- Physically relocating B's implementation is already **v3.0-gated** (a soft
  dependency from `event-bus-events.ts` on `collaboration-types.ts` must be
  decoupled first).

A full unification therefore remains a separately-votable, v3.0-gated item.

## The authority rule

**Bus A is authoritative for observability signals.** When a subsystem needs to
surface an observability signal (for example the `signal.*` events that close
the self-tuning loop — see epic #3143 P2 / #3147), it emits onto bus A. Do
**not** pull bus B's messaging semantics (topics, async, `DomainEvent`) into
bus A to make this work — that would be a merge by stealth. Keep observability
narrow and typed.

## Signal events on bus A

The self-tuning loop routes its signals through bus A as typed events:

- `signal.fitness_declined` — emitted when a fitness score falls below floor.
- `signal.swarm_unhealthy` — emitted when an agent/CLI's health degrades.
- `signal.vote_rejected` — emitted from the `consensus_vote` MCP handler when a
  vote resolves to `rejected` (see `mcp/tools/consensus-vote-signals.ts`).

The shadow `TuneStage` (`pipeline/tune-stage.ts`) subscribes to these and logs
the bounded action each implies. It is wired at server init
(`cli-server-tools.ts`) and released at shutdown (`cli-server.ts`).
