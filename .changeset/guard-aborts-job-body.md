---
'nexus-agents': patch
---

An async job whose runaway guard or wedged watchdog expires is now actually stopped, not just recorded as failed. Before, the job was marked `failed` and its concurrency slot handed to another job while its body kept running and making model calls, and a later `cancel_job` could no longer reach it.

The job's `AbortSignal` now fires before the failure is recorded and the slot is released, with a `DOMException` reason named `TimeoutError`. A CLI call ended by that signal is classified as a real `TIMEOUT` on the circuit breaker rather than as a caller cancel. A body that ignores its signal still runs to completion; the recorded `failed` verdict is unchanged. A job body that rejects on its own is not aborted.
