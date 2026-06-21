---
'nexus-agents': patch
---

Fix async job complete-after-cancel rewriting the cancellation (#4017)

`writeJobComplete` / `writeJobFailed` now no-op when the job record is already `cancelled`, so a `runAsJob`-dispatched job whose work finishes _after_ `cancel_job` landed no longer silently overwrites the `cancelled` status back to `complete`/`failed`. This makes the guard symmetric with the existing caller-side cancel-after-complete protection. (Aborting the still-running in-flight work — `runAsJob` threads no AbortSignal — remains a separate follow-up under #4017.)
