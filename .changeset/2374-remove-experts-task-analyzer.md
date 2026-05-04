---
'nexus-agents': minor
---

**Breaking (TypeScript-typed only)**: Remove the deprecated `agents/experts/task-analyzer.ts` module from the public surface (#2374, follow-up to epic #2368).

Removed exports from `src/agents/index.ts` and `src/exports/agents.ts` (publicly reachable):

- `analyzeTask(task) → Result<TaskAnalysisResult, AnalysisError>` — keyword-based heuristic classifier
- `TaskDomain` enum (`'code'`, `'architecture'`, `'security'`, `'documentation'`, `'testing'`, `'devops'`)
- `TaskComplexity` enum (`'low'`, `'medium'`, `'high'`)
- `AnalysisError` class — note: a different `AnalysisError` from `failure-analyzer-types.js` is still exported via `orchestration/index.ts`; the name collision was always present
- `TaskAnalysisResult` type
- `TaskAnalysisResultSchema` Zod schema

**Migration**: use `SharedTaskAnalyzer` from `core/task-analysis/` (canonical path per ADR-0004 / Issue #574). Different output shape — `TaskTypeCategory` enum and `ComplexityLevel` (`'simple' | 'moderate' | 'complex' | 'expert'`) — but the underlying analysis is more capable.

```diff
- import { analyzeTask } from 'nexus-agents';
- const result = analyzeTask(task);
- if (result.ok) console.log(result.value.domain);
+ import { createSharedTaskAnalyzer } from 'nexus-agents';
+ const analyzer = createSharedTaskAnalyzer();
+ const analysis = await analyzer.analyze(task);
+ console.log(analysis.taskType);
```

The deprecated module had been marked `@deprecated Use SharedTaskAnalyzer` since #574 — multi-month bake. Two e2e tests updated: `agent-expert-system.e2e.test.ts` 'Task Analysis' describe block removed (functionality now covered by SharedTaskAnalyzer's own tests in `core/task-analysis/`); `agent-skill-library.e2e.test.ts` performance test migrated to use `analyzer.analyze()`.
