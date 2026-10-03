---
'nexus-agents': patch
---

Read-only analysis tasks on the codex adapters now disable every MCP server codex's own config registers, and the opencode adapter refuses read-only analysis tasks instead of running them.

Before this, `codex exec -s read-only` and opencode's `OPENCODE_PERMISSION` deny config both still started those servers, outside the sandbox. A live run on 2026-10-02 showed the nexus-agents MCP server writing `.gitignore` and `.nexus-agents/` into the working tree on every read-only run.

- **codex `exec`:** one `-c mcp_servers.<name>.enabled=false` per server. Sources are `/etc/codex/config.toml`, `/etc/codex/managed_config.toml`, `$CODEX_HOME/config.toml` (default `~/.codex/config.toml`), and `.codex/config.toml` in each directory from the task's working directory up to the project root. For a server defined only in a project file, the override also repeats its `command` or `url`, so codex accepts it whether or not it trusts the project.
- **codex MCP transport:** the same disables, sent as the `config` argument of each new read-only thread.
- **opencode:** no longer declares read-only analysis, so a read-only task is refused before any spawn and voter seats are no longer dealt to it. opencode 1.15.13 rewrites the project's `opencode.json` on every run and substitutes `{env:}`/`{file:}` across the raw config text before parsing, so its MCP servers cannot be listed reliably. The `OPENCODE_PERMISSION` deny config it used to receive for this mode is no longer set. With claude and codex installed, the default 7-seat panel is architect/devex/pm/scope_steward on claude and security/ai_ml/catfish on codex.

A codex read-only task is refused instead of run when the adapter cannot list every server:

- a config file exists but cannot be read or parsed, or is not a regular file of at most 1 MiB (a symlink to `/dev/zero` or a FIFO is refused without being read);
- a server name that `-c` cannot address (characters outside `[A-Za-z0-9_-]`);
- plugins: an enabled `plugins` entry in any config layer, or an installed plugin under `$CODEX_HOME/plugins/` that declares MCP servers. A plugin tree deeper than six levels without a plugin root, or one containing a symlink loop, is refused rather than treated as declaring nothing;
- cloud-managed config, detected by a cached `cloud-config-bundle-cache.json` in `$CODEX_HOME` (a workspace account's first run, before that cache exists, is not detectable).

Default-mode tasks are unchanged.

`smol-toml` is now a direct dependency, used to parse codex's TOML config. It has no dependencies of its own.
