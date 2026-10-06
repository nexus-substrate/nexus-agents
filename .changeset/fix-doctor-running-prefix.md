---
'nexus-agents': patch
---

Fix doctor's install-freshness check to query the running Node interpreter's global prefix instead of whichever npm is on PATH, and report the prefix checked.
