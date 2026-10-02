---
'nexus-agents': patch
---

Prevent development pipeline dry runs from editing workspace files by enforcing read-only expert access. Planning, task decomposition, and review always run read-only; real implementation retains workspace edit access. Adapters that cannot enforce read-only access are refused explicitly.

A real (non-dry-run) plan stage now runs read-only without the nexus MCP config, so the planner no longer has nexus tools. The gemini adapter's read-only mode (agy plan mode) has not been verified live yet; see #6962.
