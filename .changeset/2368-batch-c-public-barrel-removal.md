---
'nexus-agents': minor
---

**Breaking (TypeScript-typed only)**: Remove deprecated public-barrel types from the MCP entry points (Batch C of #2368, completes #1986 partial).

Removed from `mcp/index.ts` and `mcp/tools/index.ts` public re-exports, and from `OrchestrateDeps`:

- `ITechLead` — internal-only now (kept for the SICA adapter cascade); no longer re-exported on public barrels. Use `IOrchestrator` from `core/types/orchestrator.js` instead.
- `IOrchestratorLegacy` — pure dead alias of `ITechLead`. Removed.
- `IExpertFactory` (the one in `orchestrate-types.ts`) — pure dead interface, only typed an unused field. The unrelated `IExpertFactory` interfaces in `workflows/step-executor.ts` and `mcp/tools/create-expert.ts` are unaffected.
- `IOrchestrateExpertFactory` aliased re-export — no longer needed.
- `createMockTechLead` — public export removed; the mock task-executor logic is now an inlined private helper inside `createMockOrchestrator`.
- `OrchestrateDeps.techLead` field — use `OrchestrateDeps.orchestrator` instead. The internal cli-server-tools.ts callsite now wraps the legacy `Orchestrator` agent class with `OrchestratorFactory.create('tech_lead')` to produce an `IOrchestrator`.
- `OrchestrateDeps.expertFactory` field — never used. Removed along with the `IExpertFactory` interface that typed it.

**Migration**:

```diff
- import type { ITechLead, IOrchestratorLegacy } from 'nexus-agents';
+ import type { IOrchestrator } from 'nexus-agents';
```

```diff
- registerOrchestrateTool(server, { techLead: myOrchestrator });
+ registerOrchestrateTool(server, { orchestrator: myOrchestrator });
```

```diff
- import { createMockTechLead } from 'nexus-agents';
- const mock = createMockTechLead();
+ import { createMockOrchestrator } from 'nexus-agents';
+ const mock = createMockOrchestrator();
```

Bake duration: deprecated since #595/#759 — multi-month under the `@deprecated` marker. Runtime semantics are unchanged; the cascade through `OrchestratorFactory.create('tech_lead')` produces identical behavior.

The `useMockTechLead` config field name and `OrchestratorType = 'tech_lead' | …` discriminator are deliberately preserved for now — separate concerns, separate follow-up PRs.
