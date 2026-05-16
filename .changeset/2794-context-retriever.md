---
'nexus-agents': minor
---

**Closes #2794. Phase 2 of #2792 (cross-cutting memory access).**

Adds `getContextForTask({ task, category, limit? })` — the single function every entry point will call to learn what we already know about a task. Fans out across the shared backends in parallel, tolerates individual backend failures (never throws), and returns a typed `UnifiedContext`.

```ts
import { getContextForTask } from 'nexus-agents';

const ctx = await getContextForTask({ task, category: 'code_generation' });
// ctx.beliefs            — Belief[] from HindsightBeliefMemory.recallBySubject
// ctx.similarMemories    — AgenticMemoryEntry[] from A-MEM searchAgentic
// ctx.recentLearnings    — ScoredMemoryEntry[] from adaptive retrieveByPriority
// ctx.experiencePatterns — ExperienceEntry[] from MobiMem findPatterns
// ctx.outcomes           — PerformanceSummary | null (category-scoped)
// ctx.priorStrategies    — DistilledRule[] (empty until #2797 lands)
```

**Design choice:** typed singletons over registry fan-out. Phase 1 (#2793) made `IMemoryBackend.query()` real, so registry-level `Promise.all(...domains.map(d => d.query(...)))` works — but the result type is `unknown[]` per domain, which loses the typed shapes consumers want. Reaching into `getToolMemory()` and `getOutcomeStore()` directly is cleaner for typed reads. The registry-level fan-out remains the right path for opaque/observability consumers like `memory_stats`.

New public accessors on `ToolMemoryManager`: `getBeliefMemory()`, `getAgenticMemoryBackend()`, `getAdaptiveMemoryBackend()` — so cross-cutting consumers can perform typed reads without reconstructing backends or routing through MCP tools.

Phase 3 (#2795) wires `getContextForTask` into `CompositeRouter.route`, `orchestrate`, and graph workflow start — that's where the consumer-side benefit shows up.
