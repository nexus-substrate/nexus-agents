---
title: Harness Compatibility Guide
description: Wire nexus-agents as an MCP peer from OpenCode, Codex CLI, Cursor, Aider, and Cline
tier: 2
keywords: [harness, mcp, opencode, codex, cursor, aider, cline, integration]
related_files: [AGENTS.md, CLAUDE.md, docs/guides/CUSTOM_ENDPOINT_SETUP.md, docs/ENTRYPOINTS.md]
---

# Harness Compatibility Guide

nexus-agents runs as a stdio MCP server — every harness below consumes it through the same `nexus-agents --mode=server` command. What changes per harness is **where you register the server** and **how the harness discovers `.rules/` + `AGENTS.md`**. This guide gives a tested snippet for each.

## Prerequisites (all harnesses)

```bash
npm install -g nexus-agents
nexus-agents doctor        # verify install
```

For environments without Claude CLI, also set at least one model API key:

```bash
export ANTHROPIC_API_KEY=...   # or
export OPENAI_API_KEY=...      # or
export GOOGLE_AI_API_KEY=...   # or — for custom gateway:
export NEXUS_CUSTOM_API_BASE_URL=https://your-gateway.example.com/v1
export NEXUS_CUSTOM_API_KEY=...
```

See [CUSTOM_ENDPOINT_SETUP.md](./CUSTOM_ENDPOINT_SETUP.md) for the custom-gateway path in depth.

---

## OpenCode

OpenCode reads `AGENTS.md` natively and supports MCP servers via `opencode.json`.

### Register nexus-agents as MCP peer

Create or edit `opencode.json` in your project root:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "nexus-agents": {
      "type": "local",
      "command": ["nexus-agents", "--mode=server"],
      "enabled": true
    }
  }
}
```

Or for a development install from source:

```json
{
  "mcp": {
    "nexus-agents": {
      "type": "local",
      "command": ["node", "/path/to/nexus-agents/dist/cli.js", "--mode=server"],
      "enabled": true
    }
  }
}
```

### Rules + agents

OpenCode auto-reads `AGENTS.md`. It does not currently scan `.rules/` directly — reference specific rule files from AGENTS.md (which this repo already does).

### Verify

```bash
opencode mcp list           # should show nexus-agents as connected
opencode run -m opencode/big-pickle "Use the list_experts MCP tool"
```

---

## Codex CLI

Codex CLI uses `AGENTS.md` as its canonical agent-instructions file. MCP peers register in `.codex/config.toml`.

### Register nexus-agents

```toml
# .codex/config.toml
[mcp_servers.nexus-agents]
command = "nexus-agents"
args = ["--mode=server"]
```

### Verify

```bash
codex --list-mcp
codex "run consensus_vote on this proposal: ..."
```

---

## Cursor

Cursor supports MCP servers via `.cursor/mcp.json` (project-scoped) or `~/.cursor/mcp.json` (user-scoped). Rules live at `.cursor/rules/*.mdc` — not compatible with `.rules/*.md` out of the box, but you can symlink or mirror.

### Register nexus-agents

Create `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "nexus-agents": {
      "command": "nexus-agents",
      "args": ["--mode=server"]
    }
  }
}
```

### Rules bridge

Cursor doesn't auto-load `AGENTS.md` or `.rules/*.md`. Three options:

1. **Reference-only (recommended):** create `.cursor/rules/nexus-agents.mdc` that points at the shared content:

   ```markdown
   ---
   description: nexus-agents project rules
   globs: ['**/*']
   alwaysApply: true
   ---

   See [AGENTS.md](../../AGENTS.md) and [.rules/\*.md](../../.rules/) for the authoritative rule set.
   ```

2. **Symlink:** `ln -s ../../.rules .cursor/rules-nexus` — only works on systems that preserve symlinks in version control.

3. **Mirror:** copy `.rules/*.md` into `.cursor/rules/*.mdc` with a generator script (extra build step; not recommended unless you specifically need the `.mdc` frontmatter format).

### Verify

Open the project in Cursor; the MCP tools should appear in the tool palette. Trigger one: `@nexus-agents list_experts`.

---

## Aider

Aider uses `CONVENTIONS.md` or `.aider.conf.yml` for agent instructions. MCP support is experimental — as of Aider 0.65+, register MCP servers in the config file.

### Register nexus-agents

```yaml
# .aider.conf.yml
mcp:
  nexus-agents:
    command: nexus-agents
    args: ['--mode=server']
read: AGENTS.md
```

The `read: AGENTS.md` line makes Aider load the standalone entrypoint on every session.

### Verify

```bash
aider --version       # ensure 0.65+
aider                  # /help should show the MCP tools
```

---

## Cline (VS Code extension)

Cline registers MCP servers through `cline_mcp_settings.json` (accessed via the extension settings UI or at `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` on macOS, similar on other platforms).

### Register nexus-agents

```json
{
  "mcpServers": {
    "nexus-agents": {
      "command": "nexus-agents",
      "args": ["--mode=server"],
      "disabled": false
    }
  }
}
```

### Rules

Cline reads `.clinerules` at the project root. To bridge:

```text
# .clinerules
Project rules live in .rules/*.md. See AGENTS.md for the index. Load
the relevant rule file when its topic applies:

- .rules/typescript.md for TypeScript changes
- .rules/testing.md for test work
- .rules/security.md for auth/secrets/input-validation
- (full list in AGENTS.md)
```

### Verify

Restart VS Code; Cline should list `nexus-agents` in its MCP panel with its tools available.

---

## Troubleshooting

### MCP connect fails silently

```bash
nexus-agents --mode=server < /dev/null
# Should print "Starting MCP server..." and then wait for stdio input.
# If it prints nothing or crashes, check Node version (22.x required)
# and that `nexus-agents doctor` passes.
```

### Rule-file path drift

If you symlinked or copied `.rules/*.md` into a harness-specific location, the `docs-content-drift` CI job may flag drift. Prefer reference-only wiring (option 1 in the Cursor section) over mirroring.

### Custom API key not picked up

Set env vars **before** starting the harness (MCP servers inherit the harness's environment):

```bash
export NEXUS_CUSTOM_API_BASE_URL=...
export NEXUS_CUSTOM_API_KEY=...
# Now start OpenCode/Codex/Cursor/etc.
```

For Cline and other GUI-based harnesses, set the env var at the OS level (macOS `launchctl setenv`, Linux shell profile, Windows user env vars) so the VS Code process inherits it.

## See also

- [AGENTS.md](../../AGENTS.md) — canonical agent-instructions entry point
- [CUSTOM_ENDPOINT_SETUP.md](./CUSTOM_ENDPOINT_SETUP.md) — multi-vendor gateway configuration
- [docs/ENTRYPOINTS.md](../ENTRYPOINTS.md) — full MCP tool reference
