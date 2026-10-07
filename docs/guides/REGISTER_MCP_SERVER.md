---
title: 'Register the MCP server manually'
description: 'Add nexus-agents as an MCP server to Claude Code, Claude Desktop, Cursor, Codex CLI, Gemini CLI or OpenCode without running setup.'
diataxis: how-to
audience: user
order: 10
tier: 2
keywords:
  [mcp, register, claude-code, claude-desktop, cursor, codex, gemini, opencode, configuration]
related_files:
  [
    ./HARNESS_COMPATIBILITY.md,
    ../getting-started/INSTALLATION.md,
    ../getting-started/YOUR_FIRST_RUN.md,
  ]
---

# Register the MCP server manually

Use this guide when you want to add nexus-agents to one harness by hand instead
of running `nexus-agents setup`, or when `setup` does not cover your harness.

Every harness starts the same stdio server. With a global install the command
is:

```bash
nexus-agents --mode=server
```

Without a global install, use `npx nexus-agents --mode=server`. The entries
`setup` writes for Codex CLI, Gemini CLI and OpenCode use the `npx` form.

Before you start, install nexus-agents and confirm that `nexus-agents doctor`
reports `✓ MCP Server mode: Ready`.

## Claude Code

Register through the `claude` CLI. This is the command `setup` runs.

User scope, available in every project:

```bash
claude mcp add-json nexus-agents '{"command":"nexus-agents","args":["--mode=server"]}' -s user
```

Project scope, shared with everyone who clones the repository through a
`.mcp.json` file in the project root:

```bash
claude mcp add-json nexus-agents '{"command":"nexus-agents","args":["--mode=server"]}' -s project
```

`claude mcp add-json --help` lists the accepted scopes as `local`, `user` and
`project`, with `local` as the default. `nexus-agents setup --scope project`
passes `-s local`, which registers the server for the current project on your
machine only.

Check the result:

```bash
claude mcp list
```

## Claude Desktop

`setup` does not write Claude Desktop's configuration. Edit
`claude_desktop_config.json` yourself. On Linux the file is
`~/.config/Claude/claude_desktop_config.json`; the macOS and Windows locations
are listed in [Installation](../getting-started/INSTALLATION.md).

Add the server under `mcpServers`, keeping any entries already there:

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

Restart Claude Desktop.

## Cursor

`setup` does not configure Cursor. Add an entry with the same `mcpServers`
shape as Claude Desktop through Cursor's MCP settings. The project and global
file locations are in the Cursor section of the
[Harness Compatibility Guide](./HARNESS_COMPATIBILITY.md).

## Codex CLI

Register through the `codex` CLI. This is the command `setup` runs:

```bash
codex mcp add nexus-agents -- npx nexus-agents --mode=server
```

With a global install you can use the binary directly:

```bash
codex mcp add nexus-agents -- nexus-agents --mode=server
```

Codex stores the entry in `~/.codex/config.toml` as:

```toml
[mcp_servers.nexus-agents]
command = "nexus-agents"
args = ["--mode=server"]
```

Check the result:

```bash
codex mcp list
```

## Gemini CLI

Edit `~/.gemini/settings.json` and add the server under `mcpServers`. This is
the entry `setup` writes:

```json
{
  "mcpServers": {
    "nexus-agents": {
      "command": "npx",
      "args": ["nexus-agents", "--mode=server"],
      "timeout": 30000
    }
  }
}
```

Merge it into the existing file rather than replacing the file. If
`settings.json` does not parse, `setup` replaces it with only this block.

## OpenCode

Edit `~/.config/opencode/opencode.json`, or `opencode.jsonc` if that is the file
you already have. Add the server under `mcp`. This is the entry `setup` writes:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "nexus-agents": {
      "type": "local",
      "command": ["npx", "nexus-agents", "--mode=server"],
      "enabled": true
    }
  }
}
```

`setup` always writes the user-level file. For a per-project
`opencode.json`, see the OpenCode section of the
[Harness Compatibility Guide](./HARNESS_COMPATIBILITY.md).

## Confirm the server loads

Restart the harness, then ask its agent to list the nexus-agents tools, or to
call `run` with a goal and no other arguments. A routing decision with a
`strategy` and a `recommendedTool` means the server is registered. The
[Your first run](../getting-started/YOUR_FIRST_RUN.md) tutorial shows that call.

## Related

- [Harness Compatibility Guide](./HARNESS_COMPATIBILITY.md): rules and
  `AGENTS.md` discovery per harness, plus Aider and Cline.
- [Which CLIs and keys do I need?](../reference/cli-and-key-requirements.md)
