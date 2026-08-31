---
'nexus-agents': patch
---

fix(agents): let the stall watchdog report that it is not measuring (#5282)

`HeartbeatMonitor.isStalled` returned a bare boolean, collapsing the
`'unmeasured'` state its own `classifyHealth` already computes into `false`.
Both consumers — `execute-expert.ts` and `orchestrate.ts` — therefore read a
green "not stalled" from a session no instrumentation had ever reported on.

For expert sessions that is every session. `withStep` is the only emitter on
`stepBus`, it fires exactly twice per step (open and close) with no
intermediate progress, and no `withStep` call site lies inside the expert
execution path — so `heartbeatCount` stays 0 and the warning at
`execute-expert.ts:642` was unreachable.

Resolved by a 7-voter `higher_order` panel (6 approve / 1 reject; the
`unmeasured` option leading at 66.7%). The panel explicitly rejected emitting a
synthetic heartbeat: because `withStep` reports no intermediate progress, any
such fix yields one heartbeat at session start and then silence, flipping the
check from inert to firing a FALSE stall on every model call over the 120s
threshold. `classifyHealth` already records that same finding in a comment.

`isStalled` is replaced by `classifyStallTick`, a pure classifier over the
existing `SessionHealth` vocabulary returning `'stalled' | 'unmeasured' |
'quiet'`. Removing the boolean rather than widening it is deliberate: a string
union is always truthy, so `if (monitor.isStalled(id))` would have silently
become always-true. `getHealth()` also now reports `unmeasuredSessions`, so an
all-uninstrumented fleet is no longer summarised by `stalledSessions: 0` alone.

Not a public API change — neither `HeartbeatMonitor` nor `isStalled` appears in
`api-surface.txt`.
