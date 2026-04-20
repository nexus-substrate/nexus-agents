---
'nexus-agents': minor
---

feat(swe-bench): add createHarnessVerifyAdapter factory + thread verify into runSingleInstance (#1414)

Builds on #2056 (HarnessVerifyAdapter class) and #2078 (runner
ClawGuard + task-state wiring) to expose post-patch verification at
the benchmark-runner layer.

- New `createHarnessVerifyAdapter({ modelName, evalConfig })` factory
  in `benchmark-runner.ts`. Validates the evaluation harness
  environment (Docker, disk, CPU) before constructing the adapter;
  returns `Result.err` if prerequisites aren't met so callers can
  fall back to running without verify.
- `SingleInstanceOptions` extended with optional `verifyAdapter` +
  `maxVerifyRetries` fields that flow into `RunOptions`.
- `runSingleInstance` threads both into `runAgentOnInstance`.
- 2 new factory tests: Result shape on environment failure, options
  type compatibility.
- 12 existing benchmark-runner tests pass unchanged.

Enables SWE-bench sweeps to opt into the retry loop:

```ts
const adapterResult = await createHarnessVerifyAdapter({
  modelName: executor.getModelId(),
  evalConfig,
});
const verifyAdapter = adapterResult.ok ? adapterResult.value : undefined;
await runSingleInstance({ ...opts, verifyAdapter });
```
