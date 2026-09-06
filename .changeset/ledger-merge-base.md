---
'nexus-agents': patch
---

The local pr-review ledger binds its record to `git merge-base origin/<base> <head>` — the base the governor gate recomputes since #5476 — instead of the PR payload's `base.sha`, and keeps the original as `apiBaseSha`; the `pr_review` tool's `baseSha` docs say the same (#5692).
