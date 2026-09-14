---
'nexus-agents': patch
---

The `vote` command's timeout-clamp message now renders both bounds from `VOTE_TIMEOUTS` — it said `max: 300s` while the real ceiling is 600 s (#6242).
