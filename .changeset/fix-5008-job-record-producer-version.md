---
'nexus-agents': patch
---

Async job records now carry the producing server's version (#5008).

`stampBuild()` (#5056) puts the running server's `VERSION` in `_meta['nexus-agents/build']` on every tool result — but `get_job_result` is itself a wrapped tool, so that stamp names the _reader's_ build. After a mid-session global install the process that ran an async job and the process polling for it differ, and nothing in the record said which build produced the payload. `JobResultSchema` gains an optional `producerVersion`, written by every sidecar writer (`pending`, `complete`, `failed`, `cancelled`) at write time from the writer's own `VERSION`; `runAsJob` exposes it as a `producerVersion` seam so a test can prove the stamp round-trips from an injected value that differs from `VERSION`. Records written before the field parse unchanged — absence means "produced before this field existed". `get_job_result` now returns `producerVersionMeasured` alongside `record`: `false` for a legacy record and for `'dev'` (what `VERSION` reads without the build-time define — two local builds both say `'dev'`, so it must never be treated as a match), via the new `isMeasuredBuildVersion()` helper next to the schema. The field lives in the record, not in `structuredContent`, so no `outputSchema` changes.
