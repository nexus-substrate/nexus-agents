---
'nexus-agents': patch
---

Audit `system.startup.begin` and `system.startup` records now include `packageVersion`, the running nexus-agents version (#6509). A global install can be replaced while an MCP server started earlier keeps running old code, so the startup record is the only way to tell which build wrote a window of audit records.
