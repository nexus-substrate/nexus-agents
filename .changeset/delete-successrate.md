---
'nexus-agents': major
---

feat(agents)!: remove `ExecutionPattern.successRate` and the dead ranking chain (#5261)

**BREAKING.** `successRate` is removed from the published `ExecutionPattern`
interface, reachable via the published, persisted `AgentMemoryState`.

## Read this before assuming data was lost

**The field never carried information.** Both production writers hardcoded
`1.0` — `base-agent-execution-helpers.ts` and `base-agent-memory-helpers.ts` —
and the failure path recorded an *error resolution* rather than an execution
pattern, so nothing could ever lower the running mean. Every persisted record
ever written has `successRate: 1`, for every task type, regardless of outcome.

A reader of persisted agent memory was told every task type had a 100% success
rate. Removing the field converts a silent misreport into a loud type error,
which is the correct failure mode for a record that is read back across
sessions.

Also removed: the ranking chain that sorted by it — `getTopPatterns`,
`getTopExecutionPatterns` (×2), `getTopPatternsFromState` and `doGetTopPatterns`
— five wrappers with no terminal consumer. `getTopExecutionPatterns` was
documented as returning "top patterns by success" and, sorting by a constant,
returned insertion order.

## Migration

Nothing to migrate. **Existing persisted records load unchanged** —
`loadMemoryState` reconstructs structurally with per-field defaults and no schema
validation, so the extra property on older records is ignored. That behaviour is
now pinned by a test, because a later move to a strict schema would otherwise
start rejecting every pre-existing record silently.

If you consumed `successRate`, you were reading a constant. `occurrences` on the
same interface is the count that was always real.

A genuine per-task-type reliability signal belongs in `OutcomeStore` feeding
`StrategyDistiller` — the route #2792 Phase 6 already designates for MemoryState
signals — not in a second estimator inside per-instance memory.

Ratified unanimously (6/6) on #5261 after a first round split 4/2.
