---
'nexus-agents': patch
---

**Phase 8 of #2766** — drift gate enforcing the unified memory contract. Closes #2774.

New script `scripts/check-memory-contract.ts` scans `packages/nexus-agents/src/**/*.ts` for direct memory access bypassing the contract:

| Probe                      | Pattern            | Why it's flagged                             |
| -------------------------- | ------------------ | -------------------------------------------- |
| `better-sqlite3-direct`    | `new Database(`    | Should route through `MemoryRegistry`        |
| `mobimem-direct-construct` | `new MobiMem(`     | Should call `getSharedMobiMem()` (#2719 fix) |
| `outcomes-jsonl-path`      | `'outcomes.jsonl'` | Should call `getOutcomeStore()`              |

The gate is baseline-aware (mirrors `check-tool-distinctness.ts`): existing call sites are recorded in `docs/ops/memory-contract-baseline.json`; new offenders fail CI. The baseline starts with 10 existing entries (all known-justified or pre-migration). Future PRs introducing new direct access must either go through the contract OR regenerate the baseline with a documented justification.

Wired into `pnpm governance:check` via a new `checkMemoryContract()` call in `inject-governance.ts`, so it runs on every CI pass alongside the other governance gates.

9 regression tests in `scripts/check-memory-contract.test.ts` cover positive + negative classifier cases, baseline filtering, and the JSON read path.
