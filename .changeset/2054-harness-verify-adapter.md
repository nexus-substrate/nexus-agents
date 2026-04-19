---
'nexus-agents': minor
---

feat(swe-bench): concrete HarnessVerifyAdapter for verify-loop integration (#2054)

Closes the dormant integration path from #2051 by providing a
production-ready `IVerifyAdapter` implementation that delegates to the
existing `IEvaluationHarness`.

- New `swe-bench/harness-verify-adapter.ts` with:
  - `HarnessVerifyAdapter` class — wraps `harness.evaluateInstance`
    and translates `InstanceEvaluationResult` to the `VerifyResult`
    shape the agent-runner expects
  - `translateEvaluationResult(result)` — pure translator exported
    for tests and alternative adapter implementations
- Mapping:
  - `passed` = `resolved` (all FAIL_TO_PASS pass + all PASS_TO_PASS
    still pass)
  - `stderr` = patch application error, timeout notice, or
    pytest-style list of failed tests (truncated at 20)
  - `stdout` = human-readable summary (counts + status + duration)
- Never-throw contract: on any harness exception, returns
  `{passed: false, stderr: "Harness evaluation failed: ..."}` so the
  retry loop can make a sensible decision rather than crashing
- 8 tests cover the result translator across 5 statuses
  (resolved/unresolved/error/timeout), the pass/fail wiring, the
  truncation, and the never-throws contract

Consumers activate verification by:

```ts
const harness = await createValidatedHarness(...);
const verifyAdapter = new HarnessVerifyAdapter(harness, modelName, evalConfig);
runAgentOnInstance(instance, { executor, config, verifyAdapter });
```

With this PR, the `#2051` integration is no longer dormant — SWE-bench
runs can opt into post-patch verification end-to-end.
