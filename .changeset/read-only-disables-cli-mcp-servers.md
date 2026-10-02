---
'nexus-agents': patch
---

Read-only analysis tasks on the codex and opencode adapters now disable every MCP server the CLI's own config registers. Before this, `codex exec -s read-only` and opencode's `OPENCODE_PERMISSION` deny config still started those servers, outside the sandbox. A live run on 2026-10-02 showed the nexus-agents MCP server writing `.gitignore` and `.nexus-agents/` into the working tree on every read-only run.

- **codex `exec`:** one `-c mcp_servers.<name>.enabled=false` per server. Sources are `/etc/codex/config.toml`, `/etc/codex/managed_config.toml`, `$CODEX_HOME/config.toml` (default `~/.codex/config.toml`), and `.codex/config.toml` in each directory from the task's working directory up to the project root. For a server defined only in a project file, the override also repeats its `command` or `url`, so codex accepts it whether or not it trusts the project.
- **codex MCP transport:** the same disables, sent as the `config` argument of each new read-only thread.
- **opencode:** `OPENCODE_CONFIG_CONTENT` sets `enabled: false` for each server, merged into any inherited `OPENCODE_CONFIG_CONTENT`. Sources are the global config directory, `~/.opencode/`, `$OPENCODE_CONFIG`, `$OPENCODE_CONFIG_DIR`, `opencode.json{,c}` and `.opencode/opencode.json{,c}` up to the git root, and `/etc/opencode/`.

The adapter refuses the read-only task instead of running it when it cannot list every server:

- a config file exists but cannot be read or parsed, or is not a regular file of at most 1 MiB (a symlink to `/dev/zero` or a FIFO is refused without being read);
- a codex server name that `-c` cannot address (characters outside `[A-Za-z0-9_-]`);
- an opencode config key containing `{env:` or `{file:`, which opencode substitutes before parsing, so the loaded name can differ from the written one;
- codex plugins: an enabled `plugins` entry in any config layer, or an installed plugin under `$CODEX_HOME/plugins/` that declares MCP servers;
- codex cloud-managed config, detected by a cached `cloud-config-bundle-cache.json` in `$CODEX_HOME` (a workspace account's first run, before that cache exists, is not detectable);
- an opencode `wellknown` provider credential (in `OPENCODE_AUTH_CONTENT`, or `auth.json`/`account.json` under `$XDG_DATA_HOME/opencode/`), whose remote `.well-known/opencode` config can add servers.

Default-mode tasks are unchanged.

`smol-toml` is now a direct dependency, used to parse codex's TOML config. It has no dependencies of its own.
