---
'nexus-agents': patch
---

search_usages and list_jobs: stop reporting unreadable input as measured absence

`search_usages` counted `filesScanned` as the size of the candidate set, so a file it could not open still counted as scanned. `search_usages({ symbol, path: 'src/typoed.ts' })` returned `{"filesScanned":1,"totalMatches":0,"results":[]}` — byte-identical to "I read it and the symbol is unused". The `path` branch resolves without stat-ing the file, so a typo was enough, and an agent asking "is this still used?" before a deletion got the same answer either way. `filesScanned` now counts files actually read, and `filesUnreadable` feeds the existing `scopeTruncated` disclosure from #4243 rather than a parallel signal.

`list_jobs` reported `truncated: false` over a silently lossy read: `listJobs()` returned `[]` for an unreadable jobs directory and skipped every sidecar failing `JobResultSchema` — deliberate policy in `readJobResult`, but invisible downstream. An operator or the autonomous loop concludes nothing is pending and re-dispatches work already running. Adds `jobsDirUnreadable` and `unparseableRecords`; `truncated` keeps meaning only the limit cap. An _absent_ jobs directory stays unflagged — that is a real answer, not a failure.

`listJobs()` keeps its array signature; `listJobsWithDiagnostics()` sits beside it.
