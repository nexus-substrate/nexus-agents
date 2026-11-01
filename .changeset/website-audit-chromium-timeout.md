---
'nexus-agents': patch
---

Bound website audit setup steps with explicit timeouts so intermittent Chromium apt or download stalls report cleanly without cancelling the job or skipping independent dependency audits (#7641).
