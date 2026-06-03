---
'nexus-agents': patch
---

Add a recursion guard to the Codex MCP adapter (#3350). nexus launches `codex mcp-server` as the codex adapter; if codex is configured to launch `nexus-agents --mode=server` as one of its own MCP servers, this forms a recursive spawn loop that leaks dozens of half-initialized servers, all racing the shared codex OAuth refresh-token rotation — which corrupts the on-disk token ("refresh token already used") and degrades consensus votes. The adapter now stamps each spawned `codex mcp-server` child with `NEXUS_MCP_DEPTH` and refuses to spawn when already nested, breaking the cycle after the first level. No effect on normal (non-nested) usage.
