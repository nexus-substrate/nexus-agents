---
'nexus-agents': patch
---

Read-only codex runs no longer copy a project MCP server's `url` or `command` into the codex argv. A server defined only in a project `.codex/config.toml` is still disabled with `-c mcp_servers.<name>.enabled=false`. The required transport key now carries a fixed placeholder (`nexus-agents-disabled-mcp-server` or `http://disabled.invalid/`) instead of the configured value. Before this change, a credential embedded in that url (a query token or userinfo) was visible to other local users through `ps` and `/proc` while the run lasted. Tested live on codex-cli 0.160.0: the placeholder passes codex's config validation and the server stays disabled, in both trusted and untrusted projects.
