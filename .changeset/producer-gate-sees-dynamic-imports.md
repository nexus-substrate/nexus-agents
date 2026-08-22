---
'nexus-agents': patch
---

The producer/consumer gate now recognizes a dynamic import as a consumer (#3024 follow-up).

`importSpecifierPatterns` matched only `from '…/file.js'`. A module reached by `await import('…/file.js')` has no `from`, so the gate reported a genuinely-consumed file as dead code.

That is the established shape for opt-in CLI subcommands here — `doctor-deep` and `doctor-live` are both loaded lazily so their cost is not paid on every `doctor` run — which means the gate fired on the repo's own convention, and on exactly the kind of file most likely to be new. A gate that false-positives on the normal pattern trains people to reach for its opt-out comment, and an opt-out reached by habit is how a gate stops meaning anything.

`import(...)` and `require(...)` now count alongside `from`. Verified the gate still fails on a genuinely orphaned file, because a check that stops failing is worse than the false positive it replaced.
