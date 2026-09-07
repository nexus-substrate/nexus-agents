---
'nexus-agents': patch
---

Delete six orphaned barrel files under `src/testing/` (308 lines) that nothing
imports — not production code, not tests, not CI, not a script, and not each
other except in one closed loop that is itself unreachable. Every module they
re-exported keeps its existing importers, which reach it by direct path.
