---
'nexus-agents': patch
---

Refuse MCP tool calls when a running server's installation is upgraded or removed, with a clear restart message instead of missing lazy-import chunk failures. Cache package version reads by mtime and map missing modules within the server's own dist directory to the same recovery message.
