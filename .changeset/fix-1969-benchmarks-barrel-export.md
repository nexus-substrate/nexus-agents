---
'nexus-agents': patch
---

fix(benchmarks): wire BenchmarkAdapter contract into public exports (#1965)

PR #1968 shipped the `BenchmarkAdapter` contract + `runBenchmark` orchestrator
in `src/benchmarks/` but never wired the barrel into `src/index.ts`, so the
new public API was unreachable via `import { ... } from 'nexus-agents'` in
v2.33.0. External benchmark repos (nexus-eval-template, nexus-eval-swebench,
etc.) depend on these exports.

Changes:

- Add `src/exports/benchmarks.ts` barrel covering memory, token, consolidation,
  benchmark-report, adapter-latency, and the new adapter contract
- Wire it into `src/index.ts` and `src/exports/index.ts`
- Rename `OrchestratorOptions` → `BenchmarkOrchestratorOptions` to avoid
  collision with the existing workflow `OrchestratorOptions` re-exported from
  `exports/agents.ts`
- Disambiguate `estimateTokens`: the benchmarks-flavored version is
  re-exported as `estimateBenchmarkTokens` (the memory-metric 4-char/token
  heuristic), leaving bare `estimateTokens` to resolve to the context-curator
  variant in `agents/ictm/`

No behavior change to internal consumers. New public surface:

```ts
import {
  runBenchmark,
  NOOP_PROGRESS,
  estimateBenchmarkTokens,
  type BenchmarkAdapter,
  type BenchmarkRunContext,
  type BenchmarkRunSummary,
  type BenchmarkOrchestratorOptions,
} from 'nexus-agents';
```

Unblocks standalone benchmark packages (#1962 nexus-eval-swebench).
