---
'nexus-agents': minor
---

**refactor(config):** remove the unused `WORKER_DEFAULTS` category. Closes #2977.

The `WORKER_DEFAULTS` category — 8 settings (`maxWorkers`, `poolSize`, `idleTimeoutMs`, `workflowMaxParallel`, `testParallelism`, `evaluationMaxWorkers`, `eventBusMaxHistory`, `swarmObserverMaxEvents`) — was wired into the config-command help text, the env-schema, the config-manager mapping, and the runtime resolver (`getWorkerConfig`), but had **zero production consumers**. Setting any of `NEXUS_WORKERS_MAX` / `NEXUS_WORKERS_POOL_SIZE` / `NEXUS_WORKERS_IDLE_TIMEOUT` / `NEXUS_WORKFLOW_MAX_PARALLEL` / `NEXUS_TEST_PARALLELISM` / `NEXUS_EVALUATION_MAX_WORKERS` / `NEXUS_EVENTBUS_MAX_HISTORY` / `NEXUS_SWARM_OBSERVER_MAX_EVENTS` — or `nexus-agents config set WORKER_DEFAULTS.foo X` — was a silent no-op.

Silent config rot is worse than missing knobs. Removed the category entirely; can re-add when a concrete consumer exists.

**Removed surfaces:** `DEFAULTS.WORKER_DEFAULTS`, `getWorkerConfig`, `WorkerDefaults` + `WorkerDefaultsConst` types, `WorkerDefaultsSchema` (Zod), the 7 env-schema entries for `NEXUS_WORKERS_*` + 1 for `NEXUS_EVENTBUS_MAX_HISTORY`, the 8 mappings in `config-manager.ts`, the help-text line in `cli/config-command.ts`, the "Workers" table from `getEnvVarDocumentation`, the test block in `defaults.test.ts`, and 3 cross-cutting tests that referenced `WORKER_DEFAULTS.foo` as a sample key.

**Migration:** operators setting any removed env var get no warning today (the var was already silent); after this PR the var still has no effect — same behavior. CLI users running `nexus-agents config set WORKER_DEFAULTS.foo X` will get a "key not found" error instead of the previous false success. Test runners reading `DEFAULTS.WORKER_DEFAULTS` need to derive the value elsewhere (most likely from the consumer's own config schema — `WorkflowConfig.maxParallel`, evaluation-harness types, etc.).

133 tests pass across the 4 affected test files (defaults, config-command-handlers, env-schema, config-command); tsc + eslint clean.

Marking patch because — despite removing an exported type — the type had no external consumers and the behavior change is "documented knob that did nothing now actually does nothing." Bumped to **minor** out of caution given the type-export removal and the CLI behavior change for `config set WORKER_DEFAULTS.*`.
