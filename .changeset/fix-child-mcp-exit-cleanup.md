---
'nexus-agents': patch
---

Prevent child CLI MCP config directories from leaking when a process exits during config creation. Write the small config synchronously so pending filesystem writes cannot race exit cleanup.
