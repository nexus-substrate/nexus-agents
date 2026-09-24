---
'nexus-agents': patch
---

`cancel_job` now interrupts an async `orchestrate` job while worker dispatch is running, not only between stages.

- Worker dispatch stops starting work. No further wave starts, a failed worker is not retried, and the dispatch throws before the synthesis and refinement phases instead of returning the waves that finished.
- The signal reaches every in-flight worker's model call as `CompletionRequest.signal`, and reaches the synthesis call too. SDK adapters that forward it to their `fetch` abort the request. CLI-backed adapters now forward it as well: `CliToModelAdapter` used to drop it, so neither a cancel nor a worker watchdog timeout could stop a running CLI. On POSIX each CLI now runs in its own process group, and both a cancel and a timeout signal the whole group: SIGTERM, then SIGKILL if anything in the group is still running after the 5-second grace window. A CLI that relaunches itself as a child is no longer left running as an orphan. On Windows only the direct child is signalled. The gemini adapter's environment also sets `GEMINI_CLI_NO_RELAUNCH=true`. An aborted CLI call is not retried. An adapter that ignores the signal still runs its current call to completion.
- `orchestrator.execute` still runs its current call to completion, because the orchestrator adapters ignore `OrchestratorExecuteOptions.signal`. A cancel that lands during it now records the task state as a cancelled blocker, and it no longer writes a success or failure routing outcome.
- `withWatchdog` accepts an optional fourth argument, an outer `AbortSignal`, and forwards it to the task's signal. `SynthesizeResultsInput` gains an optional `signal`.

A cancelled job's record stays `cancelled`, as before.
