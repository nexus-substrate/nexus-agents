---
'nexus-agents': patch
---

deprecate(swe-bench): mark in-tree SWE-bench wrappers as superseded by nexus-eval-swebench (#1966)

The standalone [nexus-eval-swebench](https://github.com/williamzujkowski/nexus-eval-swebench) package (built on the `BenchmarkAdapter` contract) is now the recommended way to run SWE-bench from nexus-agents.

Changes in this release:

- `nexus-agents swe-bench` CLI prints a one-time deprecation warning on invocation. Suppress with `NEXUS_SUPPRESS_SWEBENCH_DEPRECATION=1`.
- `printSweBenchHelp()` surfaces the migration path at the top of `--help` output.
- `src/exports/swe-bench.ts` barrel has a deprecation notice in its docstring with a migration example.

The in-tree runner and types remain fully functional and exported — `nexus-eval-swebench` itself consumes `SWEBenchRunner` via peer dep, so we cannot remove them without a breaking change. This deprecation is informational only; no runtime behavior changes.

Migration:

```ts
// Before
import { SWEBenchRunner } from 'nexus-agents';
const runner = new SWEBenchRunner({ variant: 'lite' });

// After (recommended)
import { runBenchmark } from 'nexus-agents';
import { SweBenchAdapter } from 'nexus-eval-swebench';
const summary = await runBenchmark(new SweBenchAdapter({ variant: 'lite' }), {});
```
