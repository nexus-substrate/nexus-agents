---
title: "MCP & Claude Desktop Integration"
description: "Configure nexus-agents as an MCP server for Claude Desktop with full tool access."
---

Configure nexus-agents as an MCP server for Claude Desktop with full tool access.

Nexus-agents implements the Model Context Protocol (MCP) 2025-11-25 specification, enabling seamless integration with Claude Desktop and other MCP-compatible clients.

## Quick Setup

### 1. Install nexus-agents

```bash
npm install -g nexus-agents
```

### 2. Configure Claude Desktop

Add nexus-agents to your Claude Desktop MCP configuration:

**macOS:** `~/.claude/mcp.json`
**Windows:** `%APPDATA%\Claude\mcp.json`
**Linux:** `~/.config/claude/mcp.json`

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

### 3. Restart Claude Desktop

After updating the configuration, restart Claude Desktop to load the MCP server.

### 4. Verify Integration

In Claude Desktop, ask:

> "orchestrate: What are the main components of this codebase?"

Claude will use the nexus-agents orchestration tool to analyze and respond.

## MCP Tools Reference

Nexus-agents provides four MCP tools that Claude can use:

### orchestrate

Orchestrate complex tasks using specialized expert agents.

```json
{
  "name": "orchestrate",
  "description": "Orchestrate a complex task using specialized expert agents",
  "inputSchema": {
    "type": "object",
    "properties": {
      "task": {
        "type": "string",
        "description": "Task description"
      },
      "context": {
        "type": "object",
        "description": "Optional context"
      },
      "maxIterations": {
        "type": "number",
        "default": 3
      }
    },
    "required": ["task"]
  }
}
```

**Example prompts:**

- "orchestrate: Review this code for security vulnerabilities"
- "orchestrate: Explain the architecture of src/agents/"
- "orchestrate: Generate tests for the user service"

### create_expert

Create a specialized expert agent for specific domains.

```json
{
  "name": "create_expert",
  "description": "Create a specialized expert agent",
  "inputSchema": {
    "type": "object",
    "properties": {
      "role": {
        "type": "string",
        "enum": ["code", "security", "architecture", "testing", "documentation"]
      },
      "modelPreference": {
        "type": "string",
        "description": "Preferred model tier"
      }
    },
    "required": ["role"]
  }
}
```

**Available roles:**

- `code` - Code analysis and implementation
- `security` - Security vulnerability detection
- `architecture` - System design and patterns
- `testing` - Test generation and coverage
- `documentation` - API docs and technical writing

### run_workflow

Execute predefined workflow templates.

```json
{
  "name": "run_workflow",
  "description": "Execute a predefined workflow template",
  "inputSchema": {
    "type": "object",
    "properties": {
      "template": {
        "type": "string",
        "description": "Workflow template name"
      },
      "inputs": {
        "type": "object",
        "description": "Workflow inputs"
      },
      "dryRun": {
        "type": "boolean",
        "default": false
      }
    },
    "required": ["template"]
  }
}
```

**Built-in templates:**

- `code-review` - Review code with security focus
- `pr-review` - GitHub PR analysis
- `test-gen` - Generate test cases
- `doc-gen` - Generate documentation

### delegate_to_model

Route tasks to the optimal model based on capabilities.

```json
{
  "name": "delegate_to_model",
  "description": "Route a task to the optimal model based on capabilities",
  "inputSchema": {
    "type": "object",
    "properties": {
      "task": {
        "type": "string",
        "description": "Task description"
      },
      "preferredCapability": {
        "type": "string",
        "enum": ["reasoning", "code", "speed", "cost"]
      }
    },
    "required": ["task"]
  }
}
```

**Capability routing:**

- `reasoning` - Complex analysis, architecture decisions
- `code` - Implementation, code generation
- `speed` - Quick responses, simple tasks
- `cost` - Budget-conscious routing

## Configuration

### Server Configuration

Create `nexus-agents.yaml` in your project root:

```yaml
# Model configuration — use latest models from each provider
# Providers: Anthropic (Claude), OpenAI (GPT/o-series), Google (Gemini), Ollama (local)
models:
  default: claude-sonnet-4
  tiers:
    fast:
      - claude-haiku-3
      - gpt-4o-mini
    balanced:
      - claude-sonnet-4
      - gpt-4o
    powerful:
      - claude-opus-4
      - o1-pro

# Expert configuration
experts:
  builtin: true
  custom:
    rust_expert:
      prompt: |
        You are an expert in Rust programming.
        Focus on memory safety, ownership, and idiomatic patterns.
      tier: powerful

# Security settings
security:
  sandbox:
    mode: policy # none | policy | container
  allowedPaths:
    - ./
  rateLimit:
    enabled: true
    requestsPerMinute: 60

# Routing configuration
routing:
  enableBudgetFilter: true
  enableTopsisRanking: true
  enableLinUCBSelection: true
  budget:
    tokenBudget: 1000000
    costBudgetUsd: 10.0
```

### Environment Variables

Set API keys for model access:

```bash
export ANTHROPIC_API_KEY="your-key"
export OPENAI_API_KEY="your-key"
export GOOGLE_AI_API_KEY="your-key"
```

### MCP Server Arguments

Pass additional arguments in the MCP configuration:

```json
{
  "mcpServers": {
    "nexus-agents": {
      "command": "nexus-agents",
      "args": ["--mode=server", "--config=/path/to/nexus-agents.yaml", "--verbose"],
      "env": {
        "NEXUS_LOG_LEVEL": "debug"
      }
    }
  }
}
```

## Tool Interaction Examples

### Security Review

User: "orchestrate: Review the authentication module for security issues"

Claude uses the orchestrate tool:

```json
{
  "task": "Review the authentication module for security issues",
  "context": { "focus": "security" },
  "maxIterations": 3
}
```

### Code Generation with Routing

User: "Use delegate_to_model to implement a binary search tree"

Claude uses delegate_to_model:

```json
{
  "task": "Implement a binary search tree with insert, search, and delete operations",
  "preferredCapability": "code"
}
```

### Workflow Execution

User: "Run the PR review workflow for PR #123"

Claude uses run_workflow:

```json
{
  "template": "pr-review",
  "inputs": {
    "url": "https://github.com/owner/repo/pull/123"
  }
}
```

## Rate Limits

MCP tools have rate limits to prevent abuse:

| Tool                | Rate Limit |
| ------------------- | ---------- |
| `orchestrate`       | 10/min     |
| `create_expert`     | 30/min     |
| `run_workflow`      | 5/min      |
| `delegate_to_model` | 20/min     |

Rate limit headers are included in responses.

## Troubleshooting

### Server Not Starting

Check the MCP configuration path and command:

```bash
# Verify nexus-agents is installed
which nexus-agents

# Test manual startup
nexus-agents --mode=server --verbose
```

### Tools Not Appearing

1. Restart Claude Desktop after config changes
2. Check for JSON syntax errors in `mcp.json`
3. Verify the command path is correct

### Authentication Errors

Ensure API keys are set:

```bash
nexus-agents doctor
```

### Debug Mode

Enable verbose logging:

```json
{
  "mcpServers": {
    "nexus-agents": {
      "command": "nexus-agents",
      "args": ["--mode=server", "--verbose"],
      "env": {
        "NEXUS_LOG_LEVEL": "debug"
      }
    }
  }
}
```

## Programmatic MCP Server

Start the MCP server programmatically:

```typescript
import { startStdioServer } from 'nexus-agents';

await startStdioServer({
  name: 'my-nexus-server',
  version: '1.0.0',
});
```

Or with custom configuration:

```typescript
import { createServer, registerTools, startStdioServer } from 'nexus-agents';

const server = createServer({
  name: 'custom-server',
  version: '1.0.0',
});

registerTools(server, {
  enableOrchestrate: true,
  enableCreateExpert: true,
  enableRunWorkflow: true,
  enableDelegateToModel: true,
});

await startStdioServer(server);
```

## Related Documentation

- [CLI Usage](../ENTRYPOINTS.md) - Use nexus-agents from the command line
- [Workflow Templates](/nexus-agents/architecture/workflow-templates/) - Create custom automation
- [Agent Development](/nexus-agents/development/agent-development/) - Build custom agents