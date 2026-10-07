---
'nexus-agents': patch
---

`nexus-agents setup --scope project` now configures OpenCode in the project directory and visibly warns that Codex setup uses user scope. Manual Claude MCP fallback commands now pass the bare server entry required by `claude mcp add-json`.
