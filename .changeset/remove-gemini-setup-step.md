---
'nexus-agents': patch
---

`nexus-agents setup` no longer writes a `nexus-agents` MCP entry into `~/.gemini/settings.json`. That step configured the retired standalone `gemini` CLI. `agy`, which now serves the Gemini routing arm, does not read that file: `agy mcp list` reports no servers while the file holds the entry. `--skip-gemini` is still accepted, so existing scripts keep working, but it now has no effect. Any entry an earlier `setup` wrote is left in place. To give `agy` the nexus-agents MCP server, use `agy mcp add`.
