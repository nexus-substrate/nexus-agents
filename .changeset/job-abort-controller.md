---
'nexus-agents': minor
---

`cancel_job` can now actually STOP in-flight work for `runAsJob`-dispatched tools
(#4086, the follow-on to #4017). Previously the shared async-job path had no abort
wiring, so a cancel only marked the durable record while the background work ran to
completion. A per-job `AbortController` registry now backs every dispatched job:
its `AbortSignal` is threaded into the job body (`run(jobId, input, signal)`), and
cancelling a `pending` job fires that signal.

A tool that threads the signal into its awaited operations is genuinely interrupted
in-process; when its `run()` rejects on abort, the terminal-writer guards (#4022)
preserve the `cancelled` record. A tool that ignores the signal still runs to
completion (you cannot stop an unyielding Promise), but its record stays
`cancelled` — so adopting the signal is per-tool and incremental, and the dispatch
infrastructure now makes it possible. Backward compatible: existing 2-arg `run`
callbacks remain valid (the trailing `signal` is simply ignored). Same-process only
(no IPC) — cross-process workers still observe cancellation by polling the record.
