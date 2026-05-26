---
'nexus-agents': patch
---

**fix(workflows):** thread AbortSignal through step-executor → BaseAgent → CompletionRequest (#3016, #3040).

Closes #3016 and #3040. Step-executor's `Promise.race` was dropping the race-loser — when the step timer fired at 120s, the in-flight model call kept running to its own 10-minute SDK timeout, surfacing as the "first-step adapter hang" from #2931.

## What changed

- `IAgent.execute` accepts an optional second arg `{ signal?: AbortSignal }`. Optional so existing callers don't break.
- `BaseAgent.execute` stashes the caller's signal in a per-task instance field (`currentExecutionSignal`), cleared in `finally`.
- `BaseAgent.complete` forwards `currentExecutionSignal` onto `CompletionRequest.signal` unless the caller already set one.
- `runTaskWithTimeout` takes optional `externalSignal`, wires it into the existing internal `AbortController` so a single signal covers both heartbeat expiry and caller-initiated cancellation.
- `StepExecutor.runExpertWithTimeout` creates an `AbortController`, passes the signal to `expert.execute(task, { signal })`, and aborts in `finally`. Abort fires for both arms of the race — clean resolution OR timeout — so the SDK call always cancels.

## Why this is a patch, not minor

The IAgent interface change adds an optional second arg; every existing `agent.execute(task)` call site keeps working. No subclass needs to override the new signature unless it wants to honor the signal. SimpleAgent, Expert, Orchestrator, and all expert subclasses inherit the signal-forwarding behavior from `BaseAgent.complete`.

## Tests

- New: `runTaskWithTimeout` external signal cancels in-flight task.
- New: pre-aborted external signal settles task immediately.
- New: step-executor passes a signal into `expert.execute` and aborts it after the race resolves.
- 148 pre-existing tests in `base-agent.test.ts`, `base-agent-execute-flow.test.ts`, `base-agent-task-helpers.test.ts`, and `step-executor.test.ts` continue to pass unchanged.

## Out of scope (deferred)

- `IModelAdapter.complete` already honors `request.signal` (#3036/PR #3038). Vendor SDKs (Anthropic, OpenAI, Google) wire `request.signal` into their respective HTTP client abort paths.
- Per-call timeout knob on `adapter.complete` is tracked separately as #2931 item 4.
- Whether the upstream model legitimately blocks for 120s vs wedges on bad network state needs repro via `query_trace(runId=<real id>)` enabled (now possible after PR #3015 — failure-envelope debuggability).
