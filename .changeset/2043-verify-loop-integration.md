---
'nexus-agents': minor
---

feat(swe-bench): wire verify loop into agent-runner (#2043 / #2032)

Final integration from the #2043 follow-up epic. The pure verify-loop
utilities from #2042 are now consumable by the SWE-bench agent runner
via a new `IVerifyAdapter` interface on `RunOptions`.

- New `IVerifyAdapter` + `VerifyResult` types on `agent-runner.ts`.
  Adapters take `(instance, patch, workDir)` and return
  `{passed, stderr, stdout}` — SWE-bench wiring to the real
  evaluation-harness is a separate follow-up so this PR is reviewable
  as a pure contract extension.
- New optional `verifyAdapter` + `maxVerifyRetries` fields on
  `RunOptions`. When `verifyAdapter` is absent, behavior is exactly
  as before — zero change for callers that haven't opted in.
- New `runPostPatchVerify` helper. After each successful patch, it:
  - Calls `adapter.verify(...)` to run the instance's test suite
  - Feeds stdout/stderr to `buildVerifyOutcome` from `verify-loop.ts`
  - On `willRetry`, sets `state.lastError` to the retry hint and
    `state.lastPatch` to the failed patch, then `continue`s the
    iteration loop — the agent sees the hint in its next prompt
- 4 new tests cover the adapter contract and the opt-in shape.
- 29 existing agent-runner + verify-loop tests pass unchanged.

Completes 5 of 5 integrations from #2043.
