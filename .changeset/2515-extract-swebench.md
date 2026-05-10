---
'nexus-agents': minor
---

Extract the SWE-bench harness from `packages/nexus-agents/src/swe-bench/` to its own repo: [`nexus-eval-swebench`](https://github.com/williamzujkowski/nexus-eval-swebench). Per the harness-extraction policy (epic #2514, originally #1960). Closes #2515.

**What changed**:

- `packages/nexus-agents/src/swe-bench/` (~101 files, ~11,594 LOC of runtime + tests) is **deleted**.
- `packages/nexus-agents/src/exports/swe-bench.ts` and the corresponding re-export from `index.ts` are removed — `SWEBenchRunner`, `EvaluationHarness`, `SWEBenchInstance`, `SWEBenchPrediction`, `SWEBenchVariant`, `SWEBenchConfig`, etc. are no longer exported from `nexus-agents`.
- `packages/nexus-agents/src/cli/swe-bench-command.ts` is deleted.
- The `nexus-agents swe-bench` CLI subcommand is preserved as a **deprecation shim** for one minor release — prints a migration message pointing at `npx nexus-eval-swebench` and exits with code 3 (`INVALID_ARGS`). Removed in the next minor.
- `packages/nexus-agents/src/swe-bench/mcp-config.ts` (used by `pipeline/expert-bridge.ts` to spawn child Claude CLI sessions with MCP access) is **relocated** to `packages/nexus-agents/src/cli-adapters/child-mcp-config.ts` — the helper is generic CLI-spawn infrastructure, not benchmark-specific.

**Migration**:

```diff
- npx nexus-agents swe-bench --variant lite --limit 5
+ export OPENAI_API_KEY=sk-...
+ npx nexus-eval-swebench --variant lite --limit 5

- import { SWEBenchRunner } from 'nexus-agents';
+ import { SweBenchAdapter } from 'nexus-eval-swebench';
+ // wraps the BenchmarkAdapter contract with an IModelAdapter you provide
```

Note that `nexus-eval-swebench` v0.2 is a **clean-room rewrite** — it does NOT re-export the legacy `SWEBenchRunner` API. The new adapter takes any `IModelAdapter` and produces `SweBenchPrediction` directly. See the [v0.2 README](https://github.com/williamzujkowski/nexus-eval-swebench#readme) for the new shape.

**Why**: keeps the published nexus-agents bundle lean — the SWE-bench harness was ~11,594 LOC of evaluation-only code that consumers running orchestration / MCP tools never needed at runtime. The harness-extraction policy concentrates benchmark code in dedicated `nexus-eval-*` repos so they can evolve independently. Per discussion in #2515, no breaking-change concern: the only consumers of the legacy `nexus-agents/swe-bench` exports were the eval repo itself (now self-contained) and the in-tree CLI subcommand (now a shim).
