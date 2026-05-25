---
'nexus-agents': patch
---

**fix(cli-adapters):** thread AbortSignal through `ICliAdapter.execute` so race-loser subprocesses get cancelled (closes #3026 finding 2).

Callers that bounded adapter latency with `Promise.race([adapter.execute(task), timeout])` had no way to tell the adapter "the timeout won, stop running." When timeout won, `adapter.execute` kept executing — the subprocess kept running to completion, then posted its result into OutcomeStore and LinUCB state for a task whose decision was already recorded. Symptoms: late outcome rows attributing success/failure to the wrong (already-discarded) candidate, LinUCB feature updates from stale CLI calls, and orphan subprocess fan-out under sustained timeout pressure.

The fix:

- Added `signal?: AbortSignal | undefined` to `ExecutionOptions`. Typed as `AbortSignal | undefined` (not `AbortSignal?`) so the pervasive internal `Required<ExecutionOptions>` shape keeps working under `exactOptionalPropertyTypes`.
- Added `ResolvedExecutionOptions = Required<Omit<ExecutionOptions, 'signal'>> & Pick<ExecutionOptions, 'signal'>` — the internal resolved-options shape used by adapters and tests. `signal` stays optional because it's a per-call hook, not a defaultable value.
- `SubprocessCliAdapter.spawnSubprocess` now:
  - Fast-fails with `TIMEOUT: Aborted before spawn` if `signal.aborted === true` (saves a child process start when an upstream wave/loop has already moved on).
  - Attaches an abort listener that SIGTERMs the child mid-execution if `signal` aborts. SIGKILL escalation from #3026 finding 1 still applies if the child ignores SIGTERM.
  - Removes the abort listener on `'close'` so it doesn't leak across child lifetimes.
- Three orchestration call sites pass `signal: controller.signal` and abort the controller in `finally`:
  - `orchestration/parallel-exploration.ts` (per-CLI partition timeout)
  - `orchestration/consensus-plan.ts` (per-CLI plan timeout)
  - `orchestration/triangulated-review.ts` (per-CLI review timeout)

Three regression tests in `subprocess-adapter.test.ts`:

- `signal.aborted === true` before call → fast-fails without spawning.
- Signal aborts mid-execution → SIGTERMs child, returns `TIMEOUT: Aborted by caller signal`.
- Signal aborts after child already exited → no SIGTERM (listener detached on `'close'`).

42 tests pass (was 39); 50 orchestration tests pass; `tsc + eslint` clean.

`orchestration/aorchestra/watchdog.ts` also races a generic `task: () => Promise<T>` against a timeout, but its callback is opaque to the watchdog so threading AbortSignal through requires a signature change at every caller — tracked as a follow-up.
