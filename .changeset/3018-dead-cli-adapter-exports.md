---
'nexus-agents': patch
---

**refactor(cli-adapters):** delete 3 exported-but-unused symbols (closes #3018).

Continuing the #2937/#2938/#2939/#2940 activate-or-delete sweep. Three symbols on `cli-adapters/index.ts` had zero non-test, non-barrel callers anywhere in the tree, and none were re-exported through the documented `packages/nexus-agents/src/exports/` public API:

- **`generateObject`** (`generate-object.ts`, 244 LOC) — Zod-schema-driven retry-with-feedback structured-output helper. Tested in `generate-object.test.ts` (222 LOC). No production caller.
- **`createCircuitBreakerRegistryWithMetrics`** (`circuit-breaker.ts:384`) — a wrapper that added a state-change logging listener to `CircuitBreakerRegistry`. Tested but never wired into the real adapter pipeline.
- **`integrateCapacityMonitorWithCircuitBreaker`** (`circuit-breaker.ts:455`) + its `CapacityMonitorIntegrationConfig` interface — bridge that would trip circuits on low-capacity signals (Issue #543's "wire up onLowCapacity callback"). The bridge was built; the callback wire-up never landed.

Removed:

- `packages/nexus-agents/src/cli-adapters/generate-object.ts` + its test file (466 LOC total).
- The two functions + interface + default-config block (~107 LOC) at the bottom of `circuit-breaker.ts`.
- Their test blocks (~261 LOC across two `describe` sections) in `circuit-breaker.test.ts`.
- Six entries on `cli-adapters/index.ts` (5 values + 1 type re-export).

Preserved:

- `CircuitBreakerRegistry`, `CliCircuitBreaker`, `CircuitError`, `mapCliErrorToCategory`, `categorizeError`, `DEFAULT_CIRCUIT_BREAKER_CONFIG` — these are the real production circuit-breaker surface and are actively used by adapters. Plus all their tests.

63 circuit-breaker tests still pass (was 87 — the 24 tests for the two deleted functions are gone). `tsc` + `eslint` clean.

If structured-output or capacity-monitor integration come back as real requirements, reintroduce them alongside the consumer code in the same PR. The pattern of producer-without-consumer is what #2937, #2938, #2939, and #2940 all surfaced — adopting that lesson now.
