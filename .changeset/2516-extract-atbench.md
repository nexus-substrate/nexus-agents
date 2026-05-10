---
'nexus-agents': minor
---

Extract Atbench (agent-trajectory safety benchmark, originally #1981) from `packages/nexus-agents/src/benchmarks/atbench/` to its own repo: [`nexus-eval-atbench`](https://github.com/williamzujkowski/nexus-eval-atbench). Per the harness-extraction policy (epic #2514, originally #1960).

**Behaviour changes**:

- The in-tree `packages/nexus-agents/src/benchmarks/atbench/` directory is **deleted** — `import { ATBenchAdapter } from 'nexus-agents/benchmarks/atbench'` no longer works. Migrate to `import { ATBenchAdapter } from 'nexus-eval-atbench'`.
- `packages/nexus-agents/src/cli/atbench-command.ts` is deleted.
- The `nexus-agents atbench` CLI subcommand is preserved as a **deprecation shim** for one minor release — it prints a migration message pointing at `npx nexus-eval-atbench` and exits with code 3 (`INVALID_ARGS`). The shim is removed in the next minor.

**Migration**:

```diff
- npx nexus-agents atbench --fixture ./fixture.jsonl
+ npx nexus-eval-atbench --fixture ./fixture.jsonl

- import { ATBenchAdapter } from 'nexus-agents/benchmarks/atbench';
+ import { ATBenchAdapter } from 'nexus-eval-atbench';
```

The eval repo is published at npm as `nexus-eval-atbench` and peer-deps `nexus-agents >= 2.33.1`.

**Why**: keeps the published nexus-agents bundle lean — atbench was ~1,328 LOC of benchmark-only code that consumers running orchestration / MCP tools never need at runtime. The harness-extraction policy concentrates benchmark code in dedicated `nexus-eval-*` repos so they can evolve independently.

**No public-API breakage**: atbench was never exposed via `nexus-agents`'s top-level `exports/`, only via the deep import path above. Operators using the CLI subcommand get the shim's migration message; library consumers using the deep import get a build error pointing at the new package.
