---
'nexus-agents': patch
---

Wait for MCP workspace roots before dispatching tools. Bound startup waiting to one second, log the selected fallback root and data directories, and retain that fallback if roots arrive late to prevent split session state.
