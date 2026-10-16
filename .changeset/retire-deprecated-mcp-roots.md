---
'nexus-agents': patch
---

Migrate MCP workspace root resolution off deprecated client `roots` (`roots/list` and `notifications/roots/list_changed`) to explicit synchronous replacement channels (`NEXUS_PROJECT_DIR`, `CLAUDE_PROJECT_DIR`, and `process.cwd()` git discovery).
