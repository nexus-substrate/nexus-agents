---
title: Quick Start Guide
description: Get nexus-agents running in 5-10 minutes with MCP or CLI mode
tier: 1
keywords: [installation, setup, getting-started, mcp, cli]
related_files: [docs/getting-started/INSTALLATION.md, docs/getting-started/CONFIGURATION.md]
---

# Nexus Agents Quick Start

Orchestrate multiple AI models using specialized experts to solve complex tasks.

**Time to first success: 5-10 minutes** (depending on prerequisites)

---

## Prerequisites

```bash
node --version   # Must be v22.x LTS (required)
```

If you have an older version, upgrade with [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm install 22 && nvm use 22
```

---

## Install

```bash
npm install -g nexus-agents
```

---

## Verify

```bash
nexus-agents doctor
```

**Expected output:**

```
Nexus Agents Doctor
===================

Checking environment...

✓ Node.js version: v22.x.x
⚠ API keys configured: 0 of 3
  Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_AI_API_KEY
✓ Configuration loaded: ./nexus-agents.yaml

Checking CLI installations...

✓ Claude CLI
  Version: 2.x.x (supported)
```

If you see errors, check the [Troubleshooting](#common-issues) section below.

---

## Option 1: Claude Code Integration (Recommended)

**Requires:** [Claude CLI](https://docs.anthropic.com/en/docs/claude-code) installed

```bash
# Auto-configure MCP server
nexus-agents setup
```

**Expected output:**

```
Nexus Agents Setup
==================

✓ Claude CLI detected (v2.x.x)
✓ MCP server configured
✓ Configuration written to ~/.claude/claude_desktop_config.json

Setup complete! Restart Claude Code to use nexus-agents.
```

Then **in Claude Code chat** (not terminal), type:

```
orchestrate: What files are in this project?
```

Claude will use the nexus-agents MCP server to coordinate experts on your task.

---

## Option 2: Standalone CLI

The standalone CLI uses external CLI tools for orchestration. Install at least one:

```bash
npm install -g @anthropic-ai/claude-code   # Claude CLI (recommended)
# Or: npm install -g @google/gemini-cli    # Gemini CLI
# Or: npm install -g @openai/codex         # Codex CLI
```

Authenticate:

```bash
claude auth login   # Follow OAuth flow
```

Run a task:

```bash
nexus-agents orchestrate "Explain closures in JavaScript"
```

**Expected output:**

```
[Orchestrator] Analyzing task...
[Orchestrator] Selected expert: code_expert
[Orchestrator] Delegating to Claude CLI...

A closure is a function that retains access to variables from its
enclosing scope even after the outer function has returned...

[Orchestrator] Task completed successfully.
```

---

## Next Steps

| Goal               | Command                                  |
| ------------------ | ---------------------------------------- |
| See all commands   | `nexus-agents --help`                    |
| List expert types  | `nexus-agents expert list`               |
| List workflows     | `nexus-agents workflow list`             |
| Review a GitHub PR | `nexus-agents review <url>`              |
| Debug routing      | `nexus-agents routing-audit "your task"` |
| Full documentation | [CLAUDE.md](./CLAUDE.md)                 |

---

## API Key Security

> **Warning:** Never commit API keys to version control.

If you need to set API keys directly (not using CLI auth), use environment variables or a `.env` file:

```bash
# Option 1: Environment variable (session only)
export ANTHROPIC_API_KEY="sk-ant-..."

# Option 2: .env file (recommended for development)
echo 'ANTHROPIC_API_KEY="sk-ant-..."' >> .env
echo '.env' >> .gitignore   # Prevent accidental commits
```

For production, use a secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.).

---

## Common Issues

| Issue                       | Solution                                                          |
| --------------------------- | ----------------------------------------------------------------- |
| "Command not found"         | Add `$(npm config get prefix)/bin` to your PATH                   |
| "No API keys configured"    | Set `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GOOGLE_AI_API_KEY` |
| Node.js version mismatch    | Install v22.x LTS with `nvm install 22`                           |
| MCP connection fails        | Run `nexus-agents setup` or verify with `claude mcp list`         |
| Setup doesn't detect Claude | Install Claude CLI: `npm install -g @anthropic-ai/claude-code`    |

For more help, see [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md).

---

_Last updated: 2026-02-01 (ET)_
