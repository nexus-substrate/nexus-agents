---
'nexus-agents': patch
---

The wedged-deploy health check reports an empty `RUNS_JSON` as unmeasured and fails, instead of reading a `gh` failure as "no runs waiting" (#5670).
