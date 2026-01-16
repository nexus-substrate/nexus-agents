# Nexus Agents Quick Start

**Time to value: 5 minutes**

---

## Prerequisites

```bash
node --version   # Must be v22.x LTS
pnpm --version   # Must be v9.x (or npm v10.x)
```

---

## Installation

```bash
npm install -g nexus-agents
```

---

## Verify Installation

```bash
nexus-agents doctor
```

Expected output:

```
✓ Node.js version: 22.x
✓ Configuration loaded
✓ API keys configured: 0 of 3
Status: Ready (limited - no API keys)
```

---

## Option 1: Claude Desktop Integration (Recommended)

Add to `~/.claude/mcp.json`:

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

Then in Claude Desktop, try:

```
orchestrate: What files are in this project?
```

---

## Option 2: Standalone CLI

Set an API key:

```bash
export ANTHROPIC_API_KEY=your-key-here
```

Run a task:

```bash
nexus-agents orchestrate "Explain closures in JavaScript"
```

---

## Option 3: PR Review Demo

```bash
nexus-agents review https://github.com/owner/repo/pull/123
```

---

## Next Steps

| Goal               | Command                                  |
| ------------------ | ---------------------------------------- |
| See all commands   | `nexus-agents --help`                    |
| List expert types  | `nexus-agents expert list`               |
| List workflows     | `nexus-agents workflow list`             |
| Debug routing      | `nexus-agents routing-audit "your task"` |
| Full documentation | See [CLAUDE.md](./CLAUDE.md)             |

---

## Common Issues

| Issue                    | Solution                                                          |
| ------------------------ | ----------------------------------------------------------------- |
| "No API keys configured" | Set `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GOOGLE_AI_API_KEY` |
| "Command not found"      | Ensure `npm bin -g` is in your PATH                               |
| MCP connection fails     | Check `~/.claude/mcp.json` syntax                                 |

For more troubleshooting, see [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md).

---

_Last updated: 2026-01-16 (ET)_
