# Claude Code (Claude CLI) Research Report

**Date:** 2026-01-04 (ET)
**Status:** Complete
**Purpose:** Planning hybrid swarm approach for nexus-agents orchestrating multiple AI CLI tools

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Available Models](#1-available-models)
3. [Authentication](#2-authentication)
4. [MCP Compatibility](#3-mcp-compatibility)
5. [CLI Interface](#4-cli-interface)
6. [Integration Potential](#5-integration-potential)
7. [Strengths for Capability Matching](#6-strengths-for-capability-matching)
8. [Recommendations for Nexus-Agents](#7-recommendations-for-nexus-agents)

---

## Executive Summary

Claude Code is Anthropic's official agentic coding tool that operates in the terminal. It provides:

- **Full codebase understanding** - Can read, analyze, and modify entire projects
- **Agentic capabilities** - Plans, executes, and verifies multi-step tasks
- **MCP client support** - Connects to MCP servers for extended tool access
- **Programmatic invocation** - Via CLI flags (`-p`) or the Claude Agent SDK
- **Multi-model support** - Opus 4.5, Sonnet 4.5, Haiku 4.5 with automatic fallback

**Key finding for nexus-agents:** Claude Code can be orchestrated as a subprocess via CLI or programmatically via the TypeScript/Python Agent SDK, making it an excellent candidate for a hybrid swarm architecture.

---

## 1. Available Models

### Model Families

| Model             | Version                      | Context Window   | Best For                                  |
| ----------------- | ---------------------------- | ---------------- | ----------------------------------------- |
| Claude Opus 4.5   | `claude-opus-4-5-20251101`   | 200K tokens      | Complex reasoning, architecture decisions |
| Claude Sonnet 4.5 | `claude-sonnet-4-5-20250929` | 200K / 1M (beta) | Daily coding, agents, implementation      |
| Claude Haiku 4.5  | `claude-haiku-4-5-20251001`  | 200K tokens      | Fast, simple tasks, background operations |
| Claude Opus 4     | `claude-opus-4-1-20250805`   | 200K tokens      | Alternative to 4.5                        |
| Claude Sonnet 4   | `claude-sonnet-4-20250514`   | 200K tokens      | Alternative to 4.5                        |

### Model Aliases

```bash
claude --model default   # Recommended for account type
claude --model sonnet    # Latest Sonnet (currently 4.5)
claude --model opus      # Opus (currently 4.5)
claude --model haiku     # Fast and efficient
claude --model sonnet[1m] # 1 million token context (beta)
claude --model opusplan  # Hybrid: Opus for planning, Sonnet for execution
```

### Pricing (API Usage)

| Model      | Input         | Output        |
| ---------- | ------------- | ------------- |
| Opus 4     | $15/1M tokens | $75/1M tokens |
| Sonnet 4   | $3/1M tokens  | $15/1M tokens |
| Sonnet 4.5 | $3/1M tokens  | $15/1M tokens |

### Recommendations

- **Default:** `sonnet` for most tasks
- **Complex architecture:** `opus` or `opusplan`
- **Speed-critical:** `haiku`
- **Long sessions:** `sonnet[1m]` (extended context, higher pricing)

**Source:** [Model Configuration - Claude Code Docs](https://code.claude.com/docs/en/model-config)

---

## 2. Authentication

### Authentication Methods

1. **OAuth Flow (Recommended for subscriptions)**
   - Claude Pro/Max subscriptions use OAuth 2.0 with PKCE
   - Tokens stored in `~/.claude/.credentials.json`
   - On macOS: Stored in encrypted Keychain

2. **API Key**
   - Set via `ANTHROPIC_API_KEY` environment variable
   - Direct API billing (pay-per-use)

3. **Third-Party Providers**
   - **Amazon Bedrock:** `CLAUDE_CODE_USE_BEDROCK=1`
   - **Google Vertex AI:** `CLAUDE_CODE_USE_VERTEX=1`

4. **API Key Helper (for automation)**
   - Configure `apiKeyHelper` in settings to run a shell script
   - Script returns API key dynamically
   - Called after 5 minutes or on HTTP 401

### Authentication for Automation

```json
// ~/.claude/settings.json
{
  "apiKeyHelper": "/path/to/get-api-key.sh"
}
```

```bash
#!/bin/bash
# get-api-key.sh
echo "$ANTHROPIC_API_KEY"
```

### Known Issues

- OAuth tokens in macOS Keychain are inaccessible over SSH
- VSCode extension prioritizes OAuth over API keys
- `claude auth status` may show "Invalid API key" with valid OAuth tokens

**Sources:**

- [Identity and Access Management - Claude Code Docs](https://code.claude.com/docs/en/iam)
- [Setup Container Authentication](https://claude-did-this.com/claude-hub/getting-started/setup-container-guide)

---

## 3. MCP Compatibility

### MCP Client Capabilities

Claude Code acts as a **full MCP client** that can connect to MCP servers:

- **Tool calling** - Invoke tools from connected MCP servers
- **Resource reading** - Access MCP resources
- **Prompt integration** - Use MCP prompts

### Supported Transport Types

| Transport | Configuration                  | Use Case                  |
| --------- | ------------------------------ | ------------------------- |
| **stdio** | Local process via command/args | Local MCP servers         |
| **HTTP**  | URL-based (recommended)        | Remote/cloud MCP servers  |
| **SSE**   | Server-Sent Events             | Legacy (being phased out) |
| **SDK**   | In-process via TypeScript      | Agent SDK applications    |

### Configuration Locations

1. **Project (recommended):** `.mcp.json` in project root
2. **Global:** `~/.claude.json` (MCP config stored under `projects` key)

### Configuration Examples

```json
// .mcp.json - stdio transport
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem"],
      "env": {
        "ALLOWED_PATHS": "/Users/me/projects"
      }
    }
  }
}
```

```json
// .mcp.json - HTTP transport
{
  "mcpServers": {
    "sentry": {
      "type": "http",
      "url": "https://mcp.sentry.dev/mcp",
      "headers": {
        "Authorization": "Bearer ${SENTRY_TOKEN}"
      }
    }
  }
}
```

### CLI Commands for MCP

```bash
# Add stdio server
claude mcp add --transport stdio myserver -- npx my-mcp-server

# Add HTTP server
claude mcp add --transport http sentry https://mcp.sentry.dev/mcp

# Add SSE server (legacy)
claude mcp add --transport sse asana https://mcp.asana.com/sse
```

### MCP in Agent SDK

```typescript
import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';

// Create in-process MCP server
const mcpServer = createSdkMcpServer({
  name: 'my-tools',
  tools: [
    tool('get_data', 'Fetch data', z.object({ id: z.string() }), async (args) => ({
      content: [{ type: 'text', text: 'data' }],
    })),
  ],
});

const result = await query({
  prompt: 'Use my tools',
  options: {
    mcpServers: {
      'my-tools': mcpServer,
      external: {
        type: 'http',
        url: 'https://example.com/mcp',
      },
    },
  },
});
```

**Sources:**

- [Connect Claude Code to tools via MCP](https://code.claude.com/docs/en/mcp)
- [MCP in the SDK](https://docs.claude.com/en/docs/agent-sdk/mcp)

---

## 4. CLI Interface

### Command Structure

```bash
# Interactive mode
claude                          # Start REPL
claude "explain this project"   # Start with prompt

# Non-interactive mode (print)
claude -p "query"               # Execute and exit
claude -p "query" --output-format json  # JSON output

# Session management
claude -c                       # Continue most recent conversation
claude -r "session-id" "query"  # Resume specific session
```

### Core CLI Flags

| Flag                       | Description                                   |
| -------------------------- | --------------------------------------------- |
| `-p, --print`              | Non-interactive mode, print response and exit |
| `-c, --continue`           | Continue most recent conversation             |
| `-r, --resume <session>`   | Resume specific session by ID                 |
| `--model <name>`           | Specify model (alias or full name)            |
| `--output-format <format>` | Output format: `text`, `json`, `stream-json`  |
| `--input-format <format>`  | Input format: `text`, `stream-json`           |

### Output Control

| Flag                          | Description                                            |
| ----------------------------- | ------------------------------------------------------ |
| `--output-format json`        | Structured JSON with result, session_id, usage         |
| `--output-format stream-json` | Newline-delimited JSON for streaming                   |
| `--json-schema '<schema>'`    | Enforce output structure via JSON Schema               |
| `--verbose`                   | Full turn-by-turn output (requires JSON in print mode) |

### System Prompt

| Flag                              | Description                         |
| --------------------------------- | ----------------------------------- |
| `--system-prompt "<prompt>"`      | Replace entire system prompt        |
| `--system-prompt-file <path>`     | Load system prompt from file        |
| `--append-system-prompt "<text>"` | Add to default prompt (recommended) |

### Tool Control

| Flag                              | Description                 |
| --------------------------------- | --------------------------- |
| `--tools ""`                      | Disable all tools           |
| `--tools "default"`               | Use default tools           |
| `--allowedTools "Read,Edit,Bash"` | Pre-approve specific tools  |
| `--disallowedTools "Bash(rm*)"`   | Block dangerous patterns    |
| `--dangerously-skip-permissions`  | Skip all permission prompts |

### Agentic Control

| Flag                       | Description                                           |
| -------------------------- | ----------------------------------------------------- |
| `--max-turns <n>`          | Limit agentic turns                                   |
| `--permission-mode <mode>` | `default`, `acceptEdits`, `bypassPermissions`, `plan` |
| `--agents '<json>'`        | Define custom subagents                               |

### Subagent Definition

```bash
claude --agents '{
  "code-reviewer": {
    "description": "Expert code reviewer",
    "prompt": "You are a senior code reviewer...",
    "tools": ["Read", "Grep", "Glob"],
    "model": "sonnet"
  },
  "debugger": {
    "description": "Debugging specialist",
    "prompt": "You are an expert debugger..."
  }
}'
```

**Source:** [CLI Reference - Claude Code Docs](https://code.claude.com/docs/en/cli-reference)

---

## 5. Integration Potential

### Subprocess Invocation

Claude Code can be spawned as a subprocess with full programmatic control:

```bash
# Basic invocation
claude -p "Analyze this code" --output-format json

# With piped input
cat code.py | claude -p "Review this code" --output-format json

# With tool restrictions
claude -p "Fix the bug" --allowedTools "Read,Edit" --output-format json

# With max turns limit
claude -p "Implement feature" --max-turns 10 --output-format json
```

### JSON Output Structure

```json
{
  "result": "Analysis complete...",
  "session_id": "uuid-here",
  "usage": {
    "input_tokens": 1000,
    "output_tokens": 500
  },
  "metadata": {...}
}
```

### Streaming Mode

```bash
# Real-time streaming
claude -p "Long task" --output-format stream-json
```

Each line is a complete JSON object (NDJSON format).

### Session Continuation

```bash
# Start task
session_id=$(claude -p "Start review" --output-format json | jq -r '.session_id')

# Continue in same session
claude -p "Continue review" --resume "$session_id"

# Or simply continue most recent
claude -p "Continue" --continue
```

### Batch Processing Pattern

```bash
#!/bin/bash
for file in src/*.ts; do
  result=$(claude -p "Review $file for security issues" \
    --output-format json \
    --allowedTools "Read,Grep" \
    --max-turns 5)
  echo "$file: $(echo $result | jq -r '.result')"
done
```

### Agent SDK (TypeScript)

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

// Basic query
const result = query({
  prompt: 'Analyze this codebase',
  options: {
    cwd: '/path/to/project',
    model: 'sonnet',
    maxTurns: 10,
    allowedTools: ['Read', 'Grep', 'Glob'],
  },
});

// Stream results
for await (const message of result) {
  if (message.type === 'assistant') {
    console.log(message.message);
  } else if (message.type === 'result') {
    console.log('Done:', message.result);
  }
}
```

### Agent SDK Key Features

| Feature                | Description                                       |
| ---------------------- | ------------------------------------------------- |
| `query()`              | Primary async generator for streaming responses   |
| `tool()`               | Create type-safe MCP tool definitions             |
| `createSdkMcpServer()` | In-process MCP server                             |
| Custom subagents       | Define via `options.agents`                       |
| Hooks                  | `PreToolUse`, `PostToolUse`, `SessionStart`, etc. |
| Permission control     | `canUseTool` callback for custom authorization    |

**Sources:**

- [Run Claude Code programmatically](https://code.claude.com/docs/en/headless)
- [Agent SDK reference - TypeScript](https://platform.claude.com/docs/en/agent-sdk/typescript)

---

## 6. Strengths for Capability Matching

### Code Generation

- **Best-in-class coding:** Opus 4.5 leads on SWE-bench Multilingual (7/8 languages)
- **Full project understanding:** Analyzes entire codebases, not just single files
- **Multi-file edits:** Can modify multiple files in coordinated changes
- **Test-driven:** Can write tests, run them, and fix failures

### Code Analysis & Review

- **Security review:** Identifies vulnerabilities via pattern matching
- **Performance analysis:** Spots inefficiencies and optimization opportunities
- **Architecture understanding:** Grasps project structure and dependencies
- **Refactoring:** Plans and executes complex refactoring tasks

### Reasoning & Planning

- **Multi-step planning:** Creates detailed implementation plans
- **Trade-off analysis:** Weighs alternatives and documents decisions
- **Debugging:** Analyzes errors, identifies root causes, implements fixes
- **Documentation:** Generates accurate, contextual documentation

### Benchmark Performance (2025)

| Benchmark          | Score            |
| ------------------ | ---------------- |
| SWE-bench Verified | 72.5% (Opus 4.1) |
| HumanEval+         | 92%              |
| Terminal-bench     | 43.2%            |

### Ideal Use Cases for nexus-agents

1. **Primary coding agent** - Implementation, refactoring, debugging
2. **Code review agent** - Security, quality, performance analysis
3. **Architecture agent** - Design decisions, trade-off analysis
4. **Documentation agent** - API docs, README, inline comments
5. **Testing agent** - Test generation, coverage analysis

**Sources:**

- [Introducing Claude Opus 4.5](https://www.anthropic.com/news/claude-opus-4-5)
- [Introducing Claude Sonnet 4.5](https://www.anthropic.com/news/claude-sonnet-4-5)

---

## 7. Recommendations for Nexus-Agents

### Integration Architecture

```
nexus-agents (MCP Server)
    |
    +-- Orchestrator (TypeScript)
    |       |
    |       +-- Agent SDK (programmatic)
    |       |       |
    |       |       +-- Claude Opus (planning/architecture)
    |       |       +-- Claude Sonnet (implementation)
    |       |       +-- Claude Haiku (quick tasks)
    |       |
    |       +-- CLI subprocess (isolation)
    |               |
    |               +-- claude -p ... (batch jobs)
    |
    +-- MCP Tools (exposed to Claude Code)
            |
            +-- nexus_orchestrate
            +-- nexus_delegate
            +-- nexus_consensus
```

### Recommended Approach

1. **Use Agent SDK for tight integration**
   - TypeScript SDK for type safety
   - Full control over tool permissions
   - Custom hooks for monitoring
   - In-process MCP servers

2. **Use CLI for isolation**
   - Batch processing
   - Parallel agent spawning
   - Resource-constrained environments
   - CI/CD integration

### Configuration for Orchestration

```typescript
// nexus-agents orchestrator config
const orchestratorConfig = {
  agents: {
    planner: {
      model: 'opus',
      tools: ['Read', 'Grep', 'Glob', 'WebSearch'],
      permissionMode: 'plan',
    },
    implementer: {
      model: 'sonnet',
      tools: ['Read', 'Edit', 'Write', 'Bash'],
      maxTurns: 20,
    },
    reviewer: {
      model: 'sonnet',
      tools: ['Read', 'Grep'],
      appendSystemPrompt: 'Focus on security and performance',
    },
  },
};
```

### Authentication Strategy

1. **Development:** Use Claude Pro/Max subscription (OAuth)
2. **Production:** Use API key via `ANTHROPIC_API_KEY`
3. **CI/CD:** Use `apiKeyHelper` for secrets management

### MCP Integration

nexus-agents should:

1. **Expose MCP tools** that Claude Code can call
2. **Connect to Claude Code's MCP** for tool discovery
3. **Use Agent SDK's MCP server** for in-process tools

### Rate Limiting Considerations

| Plan              | Usage Limits                       |
| ----------------- | ---------------------------------- |
| Pro ($20/mo)      | 5x free tier, resets every 5 hours |
| Max 5x ($100/mo)  | 5x Pro, auto-fallback at 20%       |
| Max 20x ($200/mo) | 20x Pro, auto-fallback at 50%      |
| API               | Pay-per-token, no session limits   |

**Recommendation:** For heavy orchestration, use API billing to avoid session limits.

---

## Appendix: Quick Reference

### Environment Variables

```bash
# Authentication
ANTHROPIC_API_KEY=sk-...

# Model selection
ANTHROPIC_MODEL=sonnet
ANTHROPIC_DEFAULT_OPUS_MODEL=claude-opus-4-5-20251101
ANTHROPIC_DEFAULT_SONNET_MODEL=claude-sonnet-4-5-20250929
CLAUDE_CODE_SUBAGENT_MODEL=sonnet

# Third-party providers
CLAUDE_CODE_USE_BEDROCK=1
CLAUDE_CODE_USE_VERTEX=1

# Performance
DISABLE_PROMPT_CACHING=0
```

### NPM Packages

```bash
# CLI
npm install -g @anthropic-ai/claude-code

# Agent SDK
npm install @anthropic-ai/claude-agent-sdk
```

### Key URLs

- [Claude Code Overview](https://code.claude.com/docs/en/overview)
- [CLI Reference](https://code.claude.com/docs/en/cli-reference)
- [Agent SDK TypeScript](https://platform.claude.com/docs/en/agent-sdk/typescript)
- [MCP Configuration](https://code.claude.com/docs/en/mcp)
- [Model Configuration](https://code.claude.com/docs/en/model-config)
- [GitHub Repository](https://github.com/anthropics/claude-code)

---

_Report generated by nexus-agents research agent_
_Last updated: 2026-01-04 (ET)_
