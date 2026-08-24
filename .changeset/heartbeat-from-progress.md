---
'nexus-agents': minor
---

fix(agents): the stall detector can now detect a stall — the watchdog no longer pets itself

`heartbeat()` was only ever called from the same `setInterval` that read the
session's health, so `timeSinceHeartbeat` could never exceed the 15s tick. The
60s `slow` and 120s `stalled` thresholds were unreachable, `stalledSessions` was
structurally `0`, and a session whose work had genuinely hung reported `alive`
for as long as the process lived. In `orchestrate.ts` the pet was on the line
immediately above the check.

Progress now drives the heartbeat. The three monitored regions each wrap a
single opaque `await`, so there was nowhere in-line to emit from — but
`withStep` already emits on `stepBus` for every nested step inside that await,
and `EventEmitter` handlers run synchronously within `emit()`, so the emitting
code's async context is live in the handler. A session-scoped
`AsyncLocalStorage` plus one subscriber therefore attributes step activity to
exactly the session that produced it, at a single wiring point. The timers now
only read.

Adds a `SessionHealth` state of `unmeasured` for sessions nothing has claimed to
report progress for — silence only means something once something has spoken.
Sessions that ARE instrumented and still emit nothing keep reporting `stalled`,
which is the immediate-hang case and the most important one to preserve.

`weather-report` gains an additive `unmeasuredSessions` count rather than a
widened `health` union: `AgentSessionEntry` is reachable from the exported
`generateWeatherReport`, so adding a member would break downstream readers
(#4740 class).

The regression guard is source-level on purpose. Restoring the timer pet leaves
the entire behavioural suite green — a timer-driven heartbeat is
indistinguishable from a healthy session — so `heartbeat-self-petting.test.ts`
asserts that only the progress subscriber calls `heartbeat()`.

Resolves the reachability half of #4665. Panel chose this over deleting the
liveness layer, 6-1.
