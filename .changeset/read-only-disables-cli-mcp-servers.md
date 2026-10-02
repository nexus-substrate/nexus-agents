---
'nexus-agents': patch
---

Read-only analysis tasks on the codex and opencode adapters now disable every MCP server the CLI's own config registers. Before this, `codex exec -s read-only` and opencode's `OPENCODE_PERMISSION` deny config still started those servers, outside the sandbox. A live run on 2026-10-02 showed the nexus-agents MCP server writing `.gitignore` and `.nexus-agents/` into the working tree on every read-only run.

- **codex `exec`:** one `-c mcp_servers.<name>.enabled=false` per server. Sources are `/etc/codex/config.toml`, `/etc/codex/managed_config.toml`, `$CODEX_HOME/config.toml` (default `~/.codex/config.toml`), and `.codex/config.toml` in each directory from the task's working directory up to the project root. For a server defined only in a project file, the override also repeats its `command` or `url`, so codex accepts it whether or not it trusts the project.
- **codex MCP transport:** the same disables, sent as the `config` argument of each new read-only thread.
- **opencode:** `OPENCODE_CONFIG_CONTENT` sets `enabled: false` for each server, merged into any inherited `OPENCODE_CONFIG_CONTENT`. Sources are the global config directory, `~/.opencode/`, `$OPENCODE_CONFIG`, `$OPENCODE_CONFIG_DIR`, `opencode.json{,c}` and `.opencode/opencode.json{,c}` up to the git root, and `/etc/opencode/`.

If a config file exists but cannot be read or parsed, the adapter refuses the read-only task instead of running it. A codex server name that `-c` cannot address (one containing `.` or other characters outside `[A-Za-z0-9_-]`) is refused too. Default-mode tasks are unchanged.

Not covered: MCP servers from codex plugins or cloud-managed config, and opencode config fetched from a provider's remote `.well-known/opencode`.

`smol-toml` is now a direct dependency, used to parse codex's TOML config. It has no dependencies of its own.
