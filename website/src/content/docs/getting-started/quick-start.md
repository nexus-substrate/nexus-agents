---
title: Quick Start
description: Get nexus-agents running in under 5 minutes with step-by-step instructions.
---

This guide gets you from zero to a working nexus-agents setup in under 5 minutes.

## Prerequisites

Before you begin, verify you have:

```bash
node --version   # Must be v22.x
npm --version    # Must be v10.x (or pnpm v9.x)
```

You also need at least one API key:

- `ANTHROPIC_API_KEY` for Claude models (recommended)
- `OPENAI_API_KEY` for OpenAI models
- `GOOGLE_AI_API_KEY` for Gemini models

## Step 1: Install

Install nexus-agents globally:

```bash
npm install -g nexus-agents
```

Or use pnpm:

```bash
pnpm add -g nexus-agents
```

## Step 2: Verify Installation

Run the doctor command to check your setup:

```bash
nexus-agents doctor
```

You should see output like:

```
Nexus Agents Doctor
===================

Checking CLI installations...

✓ Claude CLI
  Version: 2.0.76 (supported)
  Auth: OAuth
  Capacity: 85% remaining

✓ Gemini CLI
  Version: 0.22.5 (supported)
  Auth: ADC configured

✓ Codex CLI
  Version: 0.77.0 (supported)
  Auth: OAuth

Checking MCP configuration...

✓ MCP Server mode: Ready
✓ MCP Client mode: Ready

Summary: All systems operational
```

If any CLI is missing, the doctor command will show install instructions.

## Step 3: Set Up API Key

Export your API key:

```bash
export ANTHROPIC_API_KEY="sk-ant-your-key-here"
```

Or create a `.env` file in your project:

```bash
echo "ANTHROPIC_API_KEY=sk-ant-your-key-here" > .env
```

## Step 4: Configure Claude Desktop

Add nexus-agents to your Claude Desktop MCP configuration.

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

**Linux:** `~/.config/claude/claude_desktop_config.json`

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "nexus-agents": {
      "command": "nexus-agents",
      "args": ["--mode=server"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-your-key-here"
      }
    }
  }
}
```

Restart Claude Desktop to load the new configuration.

## Step 5: Test It

Open Claude Desktop and try these commands:

### Basic Orchestration

```
orchestrate: What are the security concerns with storing passwords in plain text?
```

Claude will delegate to the Security Expert and return a detailed analysis.

### Code Review

```
orchestrate: Review this code for issues:

function login(user, password) {
  if (user === "admin" && password === "password123") {
    return true;
  }
  return false;
}
```

The Tech Lead will coordinate Code and Security experts to provide comprehensive feedback.

### Create a Custom Expert

```
create_expert: Create a testing expert specialized in React testing library
```

## Alternative: Standalone CLI

If you prefer not to use Claude Desktop, you can run nexus-agents standalone:

```bash
# Start interactive orchestration
nexus-agents orchestrate "Review this repository for security issues"

# Run a specific workflow
nexus-agents workflow run code-review --input files=src/auth.ts

# Debug routing decisions
nexus-agents routing-audit "Implement a sorting algorithm"
```

## Alternative: Claude CLI Integration

For Claude CLI (Claude Code) users, add to `~/.claude/mcp.json`:

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

Then use naturally in Claude CLI:

```bash
claude "orchestrate: analyze this codebase for performance bottlenecks"
```

## What's Next?

You now have a working nexus-agents setup. Here's where to go next:

- [Installation](/nexus-agents/getting-started/installation/) - Detailed setup for Docker, CI/CD, and advanced scenarios
- [Configuration](/nexus-agents/getting-started/configuration/) - Customize models, experts, and behavior
- [CLI Usage](/nexus-agents/guides/cli-usage/) - Master all CLI commands
- [MCP Integration](/nexus-agents/guides/mcp-integration/) - Deep dive into MCP tools

## Troubleshooting

### "Command not found: nexus-agents"

Ensure the npm global bin directory is in your PATH:

```bash
# Find the global bin directory
npm config get prefix

# Add to PATH (add to .bashrc or .zshrc)
export PATH="$(npm config get prefix)/bin:$PATH"
```

### "ANTHROPIC_API_KEY not set"

Export the environment variable or add it to the MCP config:

```bash
export ANTHROPIC_API_KEY="sk-ant-your-key"
```

### "MCP connection failed"

1. Check the config file syntax (must be valid JSON)
2. Verify the nexus-agents command works: `nexus-agents --version`
3. Restart Claude Desktop

### "Doctor shows CLI not found"

Install the missing CLI:

```bash
# Claude CLI
npm install -g @anthropic-ai/claude-code

# Gemini CLI
npm install -g @anthropic-ai/gemini-code

# Codex CLI
npm install -g @openai/codex
```

For more troubleshooting, see the [Debugging Guide](/nexus-agents/guides/debugging-observability/).
