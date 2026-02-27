---
title: 'MCP Protocol Architecture'
description: 'MCP 2025-11-25 server implementation for Claude Desktop integration'
tier: 2
keywords:
  - mcp
  - protocol
  - tool-definitions
  - server
related_files:
  - src/mcp/tools/index.ts
  - src/mcp/server.ts
---

# MCP Protocol Architecture

**Tier 3** | Deep technical documentation for MCP server development
**Hub:** [README.md](./README.md) | **Full Architecture:** [ARCHITECTURE.md](../../ARCHITECTURE.md)

---

## Overview

Model Context Protocol (MCP) integration enables Claude Desktop to orchestrate nexus-agents. The system implements the MCP 2025-11-25 specification.

### Key Capabilities

- **Tool Definitions** - Zod-validated tool schemas
- **Structured Output** - JSON and text content blocks
- **Resource Management** - Dynamic context exposure
- **Error Handling** - Tool errors vs protocol errors

---

## MCP Server Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Claude Desktop                            │
│                         │                                    │
│                    MCP Protocol                              │
│                         │                                    │
└─────────────────────────┼───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                  MCP Server (nexus-agents)                   │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                    Tool Registry                        │ │
│  │  orchestrate │ delegate │ expert │ workflow │ ...      │ │
│  └──────────────────────────┬─────────────────────────────┘ │
│                             │                                │
│  ┌──────────────────────────▼─────────────────────────────┐ │
│  │              Validation Layer (Zod)                     │ │
│  └──────────────────────────┬─────────────────────────────┘ │
│                             │                                │
│  ┌──────────────────────────▼─────────────────────────────┐ │
│  │              Agent Orchestration                        │ │
│  │  Orchestrator │ Expert Pool │ Consensus │ Workflows    │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## Tool Design Pattern

```typescript
server.tool(
  'tool_name',
  {
    // Zod schema with descriptions (Claude uses these)
    param: z.string().describe('What this parameter does'),
    optional: z.number().optional().describe('Optional parameter'),
  },
  async (args) => {
    // 1. Validate input (already done by SDK, but double-check business rules)
    const validated = Schema.safeParse(args);
    if (!validated.success) {
      return {
        isError: true,
        content: [{ type: 'text', text: validated.error.message }],
      };
    }

    // 2. Execute with proper error handling
    try {
      const result = await doWork(validated.data);
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: error.message }],
      };
    }
  }
);
```

### Tool Design Rules

1. **Clear names** - Verb-noun format: `create_expert`, `run_workflow`
2. **Detailed descriptions** - Claude uses these to decide when to call
3. **Zod validation** - All inputs validated at tool boundary
4. **Tool errors vs protocol errors** - Use `isError: true` for tool failures
5. **Structured output** - Support both `structuredContent` and `TextContent`

---

## Tool Interface

```typescript
interface ITool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: z.ZodSchema;

  execute(input: unknown): Promise<ToolResult>;
}

interface IToolRegistry {
  register(tool: ITool): void;
  get(name: string): ITool | undefined;
  list(): ToolInfo[];
  unregister(name: string): boolean;
}

interface ToolResult {
  isError?: boolean;
  content: ToolContentBlock[];
}

type ToolContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'resource'; uri: string; mimeType?: string };
```

---

## Registered Tools

| Tool                      | Description                                      | Key Parameters                 |
| ------------------------- | ------------------------------------------------ | ------------------------------ |
| `orchestrate`             | Task orchestration with expert coordination      | task, context, maxIterations   |
| `create_expert`           | Create a specialized expert agent                | role, modelPreference          |
| `execute_expert`          | Execute a task using a created expert            | expertId, task, context        |
| `run_workflow`            | Execute a workflow template                      | template, inputs, dryRun       |
| `delegate_to_model`       | Route task to optimal model                      | task, preferredCapability      |
| `consensus_vote`          | Multi-model consensus voting                     | proposal, strategy, quickMode  |
| `list_experts`            | List available expert types                      | format                         |
| `list_workflows`          | List available workflow templates                | category, format               |
| `research_query`          | Query research registry                          | action, techniqueId, query     |
| `research_add`            | Add paper to registry by arXiv ID                | arxivId, topic, priority       |
| `research_discover`       | Discover papers/repos from external sources      | topic, source, maxResults      |
| `research_analyze`        | Analyze registry for gaps, trends, coverage      | focus, topic                   |
| `research_catalog_review` | Review auto-cataloged research references        | action, identifier, topic      |
| `memory_query`            | Query across all memory backends                 | query, limit, source           |
| `memory_stats`            | Memory system statistics dashboard               | includeDecay, includePromotion |
| `weather_report`          | Multi-CLI performance weather report             | cli, category, includeAdaptive |
| `issue_triage`            | Triage GitHub issues with trust classification   | issueUrl, dryRun               |
| `run_graph_workflow`      | Execute graph-based workflows with checkpointing | workflow, inputs               |
| `execute_spec`            | Execute AI software factory spec pipeline        | spec, dryRun                   |
| `registry_import`         | Generate draft model registry entry              | provider, modelId, dryRun      |

### Tool Examples

**orchestrate**

```typescript
// Input
{ task: "Review this code for security issues", context: { file: "auth.ts" } }

// Output
{ summary: "...", experts_consulted: ["security", "code"], recommendations: [...] }
```

**workflow**

```typescript
// Input
{ template: "code-review", inputs: { url: "https://github.com/..." }, dryRun: false }

// Output
{ status: "completed", steps: [...], output: "..." }
```

---

## Resource Exposure

Dynamic context exposure to Claude:

```typescript
server.resource('project_context', 'text/markdown', async () => {
  const content = await readFile('CLAUDE.md', 'utf-8');
  return { content };
});

// Claude can read with:
// resource://nexus-agents/project_context
```

### Resource Types

| Resource          | MIME Type        | Purpose                  |
| ----------------- | ---------------- | ------------------------ |
| `project_context` | text/markdown    | CLAUDE.md instructions   |
| `architecture`    | text/markdown    | ARCHITECTURE.md summary  |
| `config`          | application/json | Current configuration    |
| `routing_stats`   | application/json | Routing performance data |

---

## Testing MCP Tools

```typescript
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

describe('MCP Tools', () => {
  let client: Client;
  let server: Server;

  beforeEach(async () => {
    // Create linked transport pair
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    server = createServer();
    client = new Client({ name: 'test-client' });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  it('should orchestrate task', async () => {
    const result = await client.callTool({
      name: 'orchestrate',
      arguments: { task: 'Test task' },
    });

    expect(result.isError).toBe(false);
    expect(result.content).toHaveLength(1);
  });
});
```

---

## Error Handling

### Tool Errors (Recoverable)

Use for expected failures:

```typescript
return {
  isError: true,
  content: [
    {
      type: 'text',
      text: 'Validation failed: task cannot be empty',
    },
  ],
};
```

### Protocol Errors (Unexpected)

Throw for unexpected failures:

```typescript
throw new McpError(ErrorCode.InternalError, 'Database connection failed');
```

### Error Categories

| Category     | isError | Throw | Example                   |
| ------------ | ------- | ----- | ------------------------- |
| Validation   | true    | No    | Invalid input format      |
| Not Found    | true    | No    | Expert type doesn't exist |
| Rate Limited | true    | No    | Too many requests         |
| Internal     | No      | Yes   | Database failure          |
| Protocol     | No      | Yes   | MCP spec violation        |

---

## Extension: Adding a New Tool

### 1. Define Tool Interface

```typescript
// src/mcp/tools/my-tool.ts
import { z } from 'zod';
import { ITool, ToolResult } from '../types.js';

const InputSchema = z.object({
  param: z.string().describe('What this does'),
  option: z.number().optional().describe('Optional setting'),
});

export const myTool: ITool = {
  name: 'my_tool',
  description: 'Does something useful',
  inputSchema: InputSchema,

  async execute(input: unknown): Promise<ToolResult> {
    const args = InputSchema.parse(input);
    // ... implementation
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  },
};
```

### 2. Register with Server

```typescript
// src/mcp/index.ts
import { myTool } from './tools/my-tool.js';

export function registerTools(server: McpServer, registry: IToolRegistry): void {
  registry.register(myTool);
  // ... other tools
}
```

### 3. Add Tests

```typescript
// src/mcp/tools/my-tool.test.ts
describe('my_tool', () => {
  it('should handle valid input', async () => {
    const result = await myTool.execute({ param: 'test' });
    expect(result.isError).toBeFalsy();
  });

  it('should reject invalid input', async () => {
    await expect(myTool.execute({})).rejects.toThrow();
  });
});
```

---

## Configuration

```yaml
mcp:
  server:
    name: nexus-agents
    version: 2.2.0
    capabilities:
      tools: true
      resources: true
      prompts: false

  transport: stdio # stdio | tcp
  # tcp:
  #   port: 3000
  #   host: localhost

  tools:
    orchestrate:
      maxTurns: 10
      timeout: 300000 # 5 minutes
    workflow:
      dryRunDefault: false
```

---

## Claude Desktop Integration

### Setup

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

### Verification

```bash
# Test MCP server starts correctly
nexus-agents --mode=server --verbose

# Check tool registration
# Look for: "Registered tool: orchestrate"
```

---

## Source Files

| File                    | Purpose                   |
| ----------------------- | ------------------------- |
| `src/mcp/index.ts`      | Server creation and setup |
| `src/mcp/tools/`        | Tool implementations      |
| `src/mcp/resources/`    | Resource handlers         |
| `src/mcp/types.ts`      | Type definitions          |
| `src/cli/cli-server.ts` | Server mode entry point   |

---

## Protocol Reference

- **Specification:** [modelcontextprotocol.io](https://modelcontextprotocol.io)
- **SDK Version:** @modelcontextprotocol/sdk@1.25.1
- **Protocol Version:** 2025-11-25

---

## Related Documents

- **Agent System:** [AGENT_SYSTEM.md](./AGENT_SYSTEM.md)
- **Security:** [SECURITY.md](./SECURITY.md)
- **Full Architecture:** [ARCHITECTURE.md](../../ARCHITECTURE.md)
- **API Reference:** [ENTRYPOINTS.md](../ENTRYPOINTS.md)
