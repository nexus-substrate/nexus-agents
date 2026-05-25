---
'nexus-agents': patch
---

**fix(orchestration):** thread AbortSignal through `withWatchdog` so race-loser worker calls get cancelled (closes #3036).

Follow-up to #3035 (which closed #3026 finding 2 for the `ICliAdapter.execute` path). The watchdog wraps `worker-dispatcher` calls that go through `IModelAdapter.complete()` — a separate adapter contract from `ICliAdapter`. When the watchdog timeout won the `Promise.race`, the underlying SDK call (Anthropic/OpenAI/Gemini/Ollama HTTP request) kept running to completion. Late results posted into `OutcomeStore` and updated `LinUCB` state for a worker whose decision had already been recorded.

Changes:

- `withWatchdog<T>` callback shape is now `(signal: AbortSignal) => Promise<T>`. The watchdog creates an internal `AbortController`, passes the signal to the task, and calls `controller.abort()` BEFORE rejecting on timeout (so signal listeners fire before the rejection propagates). The `finally` block also aborts so orphan sub-work the task spawned-but-didn't-await sees the cancel.
- `CompletionRequest` gains `signal?: AbortSignal | undefined`. Typed as union (not `AbortSignal?`) so adapter internals that destructure `request` keep working under `exactOptionalPropertyTypes`.
- `worker-dispatcher` `attemptExecution` threads the signal through `executeWorker(entry, prior, signal)`. `executeWorker` / `altExecuteWorker` signatures extended with optional `signal` third param.
- `orchestrate-dispatch` `createWorkerExecutor` / `createAltWorkerExecutor` forward the signal to `executeOnAdapter`, which sets it on `adapter.complete({ messages, signal })`.
- Concrete adapter wiring:
  - **claude**: `client.messages.create(params, { signal })` (Anthropic SDK supports per-call signal).
  - **openai**: `client.chat.completions.create(params, { signal })`.
  - **gemini**: forwarded as `config.abortSignal` on `client.models.generateContent` (`@google/genai` per-call signal).
  - **ollama**: no per-call signal in the SDK (only `Ollama.abort()` which cancels every ongoing request), so the call is wrapped in a new `raceAbort` helper. The HTTP request may still complete server-side, but no late result is awaited — `OutcomeStore` and `LinUCB` don't see ghost attributions.
  - **openai-compat**: pass-through wrapper around an inner adapter, so signal threading happens at the inner level (no change needed).

Both the `request.signal !== undefined` branches in claude/openai use explicit if/else to avoid passing `undefined` as a positional second arg — vitest 4 `toHaveBeenCalledWith(params)` treats `(params, undefined)` as a distinct call shape from `(params)`.

Tests:

- 3 new `watchdog.test.ts` cases: timeout aborts the signal before rejecting; the task can observe the abort and stop early; abort still fires in `finally` when the task wins cleanly.
- New `abort-utils.test.ts` with 7 cases for the `raceAbort` helper.
- All 1,820 tests in `src/adapters/`, `src/orchestration/`, and `src/mcp/tools/orchestrate-dispatch.test.ts` pass.

`tsc --noEmit` + `eslint` clean.
