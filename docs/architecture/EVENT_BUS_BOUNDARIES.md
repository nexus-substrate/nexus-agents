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
- `signal.swarm_unhealthy` — emitted when an agent/CLI's health degrades, from
  two producers: the SwarmObserver bottleneck poll
  (`observability/swarm-health-signals.ts`, #3223) and adapter circuit-breaker
  failovers (`observability/failover-signals.ts`, #3321, which carry the exact
  `CliName`).
- `signal.vote_rejected` — emitted from the `consensus_vote` MCP handler when a
  vote resolves to `rejected` (see `mcp/tools/consensus-vote-signals.ts`).

The `TuneStage` (`pipeline/tune-stage.ts`) subscribes to these. It is wired at
server init (`cli-server-tools.ts`) and released at shutdown (`cli-server.ts`).

## The self-tuning loop (#3143)

The loop closes `signal → tune → route` end-to-end, gated by the single
`NEXUS_TUNE_ENFORCE` flag (default **on** since v2.96; opt out with
`NEXUS_TUNE_ENFORCE=false`):

```
producers ──signal.swarm_unhealthy──▶ TuneStage ──demote──▶ TuneAdjustmentStore ──penalty──▶ CompositeRouter
(swarm health,                        (consumer)            (bounded, decaying)             (reads multiplier
 adapter failover)                                                                           into candidate score)
```

- **Enforce (default, `NEXUS_TUNE_ENFORCE` unset/true):** a
  `signal.swarm_unhealthy` applies a bounded demotion via
  `TuneAdjustmentStore.demote`; the `CompositeRouter` reads `effectiveMultiplier`
  as an additive scoring penalty. The same flag gates both the write and the
  read, so the loop is **fully live or fully shadow, never half-wired**. Each
  demotion is appended to the immutable audit log as `tune.demote`
  (`verify_audit_chain`).
- **Shadow (opt-out, `NEXUS_TUNE_ENFORCE=false`):** the `TuneStage` logs the
  demotion it _would_ apply and records it to the `intended` counter
  (`TuneAdjustmentStore.recordIntended` — counter only, **routing untouched**).
  Observe via `nexus-agents health` → "Self-Tuning Demotions" (`applied` vs
  `intended` per CLI). Non-routing signals (`fitness_declined`, `vote_rejected`)
  always stay shadow-logged.

## Pipeline policy audit: two records, one canonical source (#3710)

The dev-pipeline consensus→execute policy gate
(`pipeline/policy-evaluator.ts → evaluatePipelinePolicy`) **dual-emits** each
`policy.evaluated` decision:

| Sink                           | Path                                                                      | Lifetime                                            | Role                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Bus A (observability)**      | `IEventBus.emit` → `TraceWriter` → per-run `trace.jsonl`                  | Per-run, bounded ring buffer, dropped on no session | **Observability only.** Replay/debug a single run.                                      |
| **Durable hash-chained audit** | `AuditTrail` → `createDurableAuditSink(auditLogger)` → `FileAuditStorage` | Immutable, process-spanning, `verify_audit_chain`   | **Canonical source** for tune/readiness aggregation (soak-vs-enforce evidence — #3653). |

The durable `policy_gate` record carries `mode` (`warn`=soak vs `block`=enforce),
`ruleIds`, and `stageType` in its metadata — exactly what the tune/readiness
loop needs to distinguish soak evidence from enforced denials. The bus
`policy.evaluated` event does **not** carry these and is per-run.

**Aggregation rule:** sum durable `policy_gate` records **only**. The two
records are intentional (back-compat for existing TraceWriter consumers + a
durable sink that survives process exit) — **never sum `trace.jsonl` together
with the durable log**, or every decision is double-counted. The durable log is
authoritative; `trace.jsonl` is for single-run observability.

The durable sink is wired only when the MCP server threads its single startup
`auditLogger` (one `AuditTrail` built per run wrapping it, so all runs share the
one hash chain — appends serialize on the single-threaded event loop). The
pure-CLI path threads no logger, so it keeps only the bus emit (behavior
unchanged).

**Bounded-safety invariants** (in `core/tune-adjustment-store.ts`) — the loop is
self-correcting, never a ratchet: demotion-only (slow a CLI, never boost it);
floored at `0.5` (never zeroed — a sole-viable CLI stays selectable); capped at
`0.2` per step; time-decaying linearly back to neutral over 30 minutes (a
transient blip auto-reverses). This is a **separate** channel from the LinUCB
real-outcome bandit (per the #3147 ratifying-vote dissent). Operator control is
the single `NEXUS_TUNE_ENFORCE` flag; see
[CONFIGURATION.md](../getting-started/CONFIGURATION.md#learning--memory-variables).
