---
'nexus-agents': minor
---

**Breaking (TypeScript-typed only)**: Rename `'tech_lead'` member of the `OrchestratorType` discriminator union to `'orchestrator'` (#2375, follow-up to epic #2368).

`OrchestratorType` is the orchestrator-implementation discriminator (LLM-based vs declarative-workflow vs browser-puppeteer vs custom) — separate from the `AgentRole` union that Batch B (#2371) cleaned up. The `'tech_lead'` member was a stale reference to the original class name; the underlying class has been called `Orchestrator` since #759.

```diff
- type OrchestratorType = 'tech_lead' | 'puppeteer' | 'workflow' | 'custom';
+ type OrchestratorType = 'orchestrator' | 'puppeteer' | 'workflow' | 'custom';
```

```diff
- factory.create('tech_lead');
+ factory.create('orchestrator');
```

```diff
- if (adapter.type === 'tech_lead') { ... }
+ if (adapter.type === 'orchestrator') { ... }
```

Runtime semantics unchanged: the `'orchestrator'` discriminator now produces the same orchestrator implementation that `'tech_lead'` produced before (the LLM-based decomposition orchestrator, wrapped via `OrchestratorAdapter`).

Internal call sites (cli-server-tools.ts, mcp/tools/orchestrate.ts, mcp/tools/orchestrate-types.ts, orchestration/orchestrator-factory.ts, orchestration/orchestrator-adapters.ts) and tests (~25 fixtures) updated. `docs/interfaces/orchestrator.md` reference doc updated.
