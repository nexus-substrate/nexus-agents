---
'nexus-agents': patch
---

fix(orchestration): make the strategy-manifest lockstep test real and cross-check executorAvailable (#3881)

The strategy-manifest schema billed two safety properties that were not actually
anchored to reality:

1. The "lockstep" test used a hand-copied literal list of the 8 router strategies
   instead of deriving from the `ExecutionStrategy` union, so ADDING a strategy to
   the router without registering a manifest stayed green. The expected strategy
   set is now derived from a single runtime tuple (`EXECUTION_STRATEGY_NAMES`) that
   the Zod enum is built from, tied to the router `ExecutionStrategy` union by a
   compile-time mutual-assignability assertion — adding a member on either side is
   now a typecheck failure.

2. `executorAvailable` was a self-declared boolean never cross-checked against the
   real executor registry, so it could silently go fail-OPEN. A new test in
   `strategy-manifest-registry.test.ts` derives the wired-executor set from the
   LIVE `buildDefaultExecutors` factory keys and asserts each manifest's
   `executorAvailable` matches, plus a guard that the frozen legacy snapshot has
   not rotted versus the live factory.

Scope confined to `strategy-manifest.ts`, `strategy-manifest-registry.ts`, and
their test files; `meta-orchestrator.ts` was not modified.
