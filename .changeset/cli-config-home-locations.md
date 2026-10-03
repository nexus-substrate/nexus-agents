---
'nexus-agents': patch
---

Forward CODEX_HOME, CLAUDE_CONFIG_DIR, XDG_CONFIG_HOME, XDG_DATA_HOME, XDG_STATE_HOME, and XDG_CACHE_HOME to spawned CLIs so relocated config and data directories are honored. Codex read-only MCP isolation scans the same forwarded CODEX_HOME/config.toml the child loads. Cross-vendor credential filtering remains intact.
