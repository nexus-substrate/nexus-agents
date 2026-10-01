---
'nexus-agents': patch
---

Fix `query_trace` so it can read development-pipeline execution traces. New development-pipeline traces use the shared `runs/` directory; historical traces in `traces/` remain readable through a fallback when the run is absent from `runs/`. Disk results include `sourceDirectory` (`runs` or `traces`), and `runs/` takes precedence if both directories contain the same run ID. A trace missing from both directories retains the existing `not_found` response.

Traces that dev-pipeline sessions wrote before this release stay readable from `traces/`. A session resumed after upgrading writes its new events to `runs/`, which takes precedence. The older part of that session's trace in `traces/` is then no longer returned.
