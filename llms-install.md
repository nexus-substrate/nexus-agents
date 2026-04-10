# Installing nexus-agents

nexus-agents is an intelligent orchestration platform for AI coding tools. It coordinates multiple AI CLIs (Claude, Codex, Gemini, OpenCode) through a single MCP server.

## Prerequisites

- Node.js 22.x or later
- pnpm 9.x (or npm 10.x)

## Install

```bash
npm install -g nexus-agents
```

## Verify Installation

```bash
nexus-agents doctor
```

## Configure as MCP Server

### For Claude Code

```bash
nexus-agents setup
```

This auto-configures the MCP server in your Claude Code settings.

### Manual MCP Configuration

Add to your MCP config file (`~/.claude/mcp.json` for Claude Code, `.mcp.json` for project-level):

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

## Environment Variables (Optional)

Set API keys for the AI CLIs you want to use:

```bash
export ANTHROPIC_API_KEY=your-key    # For Claude adapter
export OPENAI_API_KEY=your-key       # For Codex adapter
export GOOGLE_AI_API_KEY=your-key    # For Gemini adapter
```

At least one API key is needed for real model routing. Without keys, tools like `consensus_vote` can use `simulateVotes: true` for testing.

## Available Tools (30)

Once connected, these MCP tools are available:

- `orchestrate` — Task orchestration with expert coordination
- `create_expert` / `execute_expert` — Dynamic expert agent creation and execution
- `consensus_vote` — Multi-model consensus voting (5 algorithms)
- `delegate_to_model` — Capability-matched task routing
- `run_dev_pipeline` — Full dev workflow: research, plan, vote, implement, QA, security
- `research_discover` / `research_analyze` — Academic paper and repo discovery
- `memory_query` / `memory_write` — Cross-session memory with 8 backends
- `weather_report` — CLI performance monitoring and routing health
- `repo_analyze` / `repo_security_plan` — Repository analysis and security planning
- `search_codebase` / `extract_symbols` — Code intelligence
- `run_pipeline` — Configurable multi-stage pipeline execution
- And 15 more (run `nexus-agents --help` for full list)

## Troubleshooting

If `nexus-agents doctor` reports issues:

1. **No CLI adapters detected** — Set at least one API key above
2. **better-sqlite3 missing** — Run `npm rebuild better-sqlite3`
3. **MCP connection fails** — Ensure `--mode=server` is in the args
