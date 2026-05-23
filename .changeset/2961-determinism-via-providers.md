---
'nexus-agents': patch
---

**fix(determinism):** route 4 ID/random sites through the time/random providers. Closes #2961.

Four production sites escape-hatched the `getTimeProvider()` / `getRandomProvider()` abstractions, breaking replay reproducibility + snapshot testing. Audit found 4 real bugs out of ~450 candidate sites — the abstractions are well-adopted; these were the gaps on **persistence keys** (IDs that get written to disk and compared in tests).

- `agents/orchestration/experience-buffer.ts:80` — replay-buffer episode `id` was `crypto.randomUUID()` → `getRandomProvider().uuid()`.
- `mcp/tools/weather-report.ts:238` — routing exploration gate was `Math.random()` (the only such call in production code) → `getRandomProvider().random()`.
- `pipeline/agent-executor.ts:69` + `:126` — persisted outcome-store record ID + memory session ID used raw `Date.now()` → both via `getTimeProvider().now()`.
- `pipeline/dev-pipeline.ts:308` — `HindsightRecord.hindsightId` (the persisted belief-store lookup key) used `Date.now().toString(36)` → `getTimeProvider().now().toString(36)`.

Behavior is unchanged in production (the providers default to real time / `crypto`); tests using seeded providers now get reproducible IDs.
