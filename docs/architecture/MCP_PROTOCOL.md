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

**Tier 2** | Deep technical documentation for MCP server development
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
| `research_synthesize`     | Synthesize registry into topic clusters          | topicFilter                    |
| `memory_query`            | Query across all memory backends                 | query, limit, source           |
| `memory_stats`            | Memory system statistics dashboard               | includeDecay, includePromotion |
| `memory_write`            | Write entry to a specific memory backend         | backend, key, value, metadata  |
| `weather_report`          | Multi-CLI performance weather report             | cli, category, includeAdaptive |
| `issue_triage`            | Triage GitHub issues with trust classification   | issueUrl, dryRun               |
| `run_graph_workflow`      | Execute graph-based workflows with checkpointing | workflow, inputs               |
| `execute_spec`            | Execute AI software factory spec pipeline        | spec, dryRun                   |
| `registry_import`         | Generate draft model registry entry              | provider, modelId, dryRun      |
| `repo_analyze`            | Analyze a GitHub repository structure            | repoUrl, includeSecurityGaps   |
| `repo_security_plan`      | Generate security scanning pipeline for a repo   | repoUrl, analysis              |
| `query_trace`             | Query execution trace JSONL files from disk      | runId, eventType, limit        |

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

## Tool Annotation Taxonomy (MCP 2025-11-25)

Every registered MCP tool declares all four annotation hints from the 2025-11-25 spec. Annotations live in a single source of truth — `packages/nexus-agents/src/mcp/tool-annotations.ts` — and each `server.registerTool()` call reads its annotations via `getToolAnnotations(name)`. CI gate `check:tool-annotations` enforces parity between the central map and the registered tools.

Per the MCP spec these are **hints**, not enforcement primitives — clients should never make safety decisions based on annotations received from untrusted servers. nexus-agents uses them for: programmatic prerequisite gates ([#2652](https://github.com/nexus-substrate/nexus-agents/issues/2652)), retry-policy decisions in pipeline runners (only retry tools where `idempotentHint === true`), and permission-prompt UX consistency across harnesses.

| Tool                          | readOnly | destructive | idempotent | openWorld | Why                                                      |
| ----------------------------- | :------: | :---------: | :--------: | :-------: | -------------------------------------------------------- |
| `orchestrate`                 |    ❌    |     ❌      |     ❌     |    ✅     | Spawns workers that may write; calls CLIs                |
| `create_expert`               |    ❌    |     ❌      |     ❌     |    ❌     | Mutates in-memory expert registry                        |
| `execute_expert`              |    ❌    |     ❌      |     ❌     |    ✅     | Invokes external CLIs; expert may write                  |
| `run_workflow`                |    ❌    |     ❌      |     ❌     |    ✅     | Steps may write to registry / FS                         |
| `run_graph_workflow`          |    ❌    |     ❌      |     ❌     |    ✅     | Multi-step graph; checkpointed                           |
| `run_pipeline`                |    ❌    |     ❌      |     ❌     |    ✅     | Plugin by name; may write                                |
| `run_dev_pipeline`            |    ❌    |     ❌      |     ❌     |    ✅     | Full research→plan→implement loop                        |
| `execute_spec`                |    ❌    |     ❌      |     ❌     |    ✅     | AI software factory spec                                 |
| `consensus_vote`              |    ❌    |     ❌      |     ❌     |    ✅     | Records vote outcome to audit log; calls CLIs            |
| `supply_chain_tradeoff_panel` |    ❌    |     ❌      |     ❌     |    ✅     | Per-axis vote; records outcome                           |
| `pr_review`                   |    ❌    |     ❌      |     ❌     |    ✅     | Writes review comments                                   |
| `delegate_to_model`           |    ✅    |     ❌      |     ✅     |    ❌     | Returns routing recommendation only                      |
| `list_experts`                |    ✅    |     ❌      |     ✅     |    ❌     | Local registry read                                      |
| `list_workflows`              |    ✅    |     ❌      |     ✅     |    ❌     | Local registry read                                      |
| `research_query`              |    ✅    |     ❌      |     ✅     |    ❌     | Reads registry                                           |
| `research_analyze`            |    ✅    |     ❌      |     ✅     |    ❌     | Reads registry                                           |
| `research_synthesize`         |    ✅    |     ❌      |     ✅     |    ❌     | Reads registry                                           |
| `research_discover`           |    ✅    |     ❌      |     ✅     |    ✅     | Calls external APIs (arXiv, GitHub); no registry write   |
| `research_add`                |    ❌    |     ❌      |     ❌     |    ✅     | Mutates registry; calls arXiv API                        |
| `research_add_source`         |    ❌    |     ❌      |     ❌     |    ✅     | Mutates registry                                         |
| `research_catalog_review`     |    ❌    |     ❌      |     ❌     |    ❌     | May approve/dismiss catalog entries                      |
| `survey_oss_landscape`        |    ✅    |     ❌      |     ✅     |    ✅     | Transient GitHub search; no persistence                  |
| `vendor_publishing_audit`     |    ✅    |     ❌      |     ✅     |    ❌     | Static lookup against curated seed                       |
| `compare_data_feeds`          |    ✅    |     ❌      |     ✅     |    ❌     | Local file diff only                                     |
| `memory_query`                |    ✅    |     ❌      |     ✅     |    ❌     | Reads memory backends                                    |
| `memory_stats`                |    ✅    |     ❌      |     ✅     |    ❌     | Reads memory stats                                       |
| `memory_write`                |    ❌    |     ❌      |     ❌     |    ❌     | Writes to memory backend                                 |
| `weather_report`              |    ✅    |     ❌      |     ✅     |    ❌     | Reads outcome store                                      |
| `query_trace`                 |    ✅    |     ❌      |     ✅     |    ❌     | Reads trace JSONL files                                  |
| `query_task_state`            |    ✅    |     ❌      |     ✅     |    ❌     | Reads task-state log                                     |
| `verify_audit_chain`          |    ✅    |     ❌      |     ✅     |    ❌     | Verifies hash chain; no mutation                         |
| `improvement_review`          |    ❌    |     ❌      |     ❌     |    ✅     | May file GitHub issues when `fileIssues=true`            |
| `repo_analyze`                |    ✅    |     ❌      |     ✅     |    ✅     | Reads repo metadata via GitHub API                       |
| `repo_security_plan`          |    ✅    |     ❌      |     ✅     |    ✅     | Returns plan; doesn't write it                           |
| `extract_symbols`             |    ✅    |     ❌      |     ✅     |    ❌     | Reads source files                                       |
| `search_codebase`             |    ✅    |     ❌      |     ✅     |    ❌     | Reads source files                                       |
| `issue_triage`                |    ❌    |     ❌      |     ❌     |    ✅     | May write GitHub labels/comments when authorized         |
| `registry_import`             |    ✅    |     ❌      |     ✅     |    ✅     | Generates draft registry entry; validates against vendor |

### Why no tool is `destructiveHint: true`

A `destructiveHint: true` tool can delete or overwrite data without the caller's input. nexus-agents tools are universally additive (writes are creates, not deletes) or return-only — no tool's body calls `rm`, `DELETE FROM`, or equivalent. If a future tool needs `destructiveHint: true` (e.g., a "drop registry entry" tool), it should also wire a prerequisite gate per [#2652](https://github.com/nexus-substrate/nexus-agents/issues/2652).

### Adding a new tool

1. Implement the tool in `packages/nexus-agents/src/mcp/tools/<tool>.ts`.
2. Add it to `REGISTERED_TOOL_NAMES` in `packages/nexus-agents/src/mcp/tools/index.ts`.
3. Add its annotations to `TOOL_ANNOTATIONS` in `packages/nexus-agents/src/mcp/tool-annotations.ts`.
4. Pass `annotations: getToolAnnotations('your_tool_name')` to the `server.registerTool()` config object.
5. Run `npx tsx scripts/inject-governance.ts check` — `check:tool-annotations` confirms parity.

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
      prompts: true # 4 prompts registered

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

## Client Request Timeouts — Long-Running Tools

The MCP TypeScript SDK ships with `DEFAULT_REQUEST_TIMEOUT_MSEC = 60_000` (see [`@modelcontextprotocol/sdk` → `shared/protocol.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/src/shared/protocol.ts)). That is a **client-side** cap on how long the client will wait for a tool response. If a nexus-agents tool has a configured per-tool budget that exceeds this, the client will kill the request before the server-side deadline can fire.

**Long-running tools** (`orchestrate`, `consensus_vote`, `run_workflow`) have multi-minute budgets configured in `MCP_TIMEOUTS.perTool` (`packages/nexus-agents/src/config/timeouts.ts`). Callers MUST configure their client to:

1. **Pass `options.onprogress`** in the SDK `client.request()` call. The SDK only injects `_meta.progressToken` into the JSON-RPC payload when an `onprogress` handler is supplied (`shared/protocol.ts:643`). Without `progressToken`, the server's `withProgressHeartbeat` emits notifications into a void.

2. **Set `options.resetTimeoutOnProgress: true`**. The SDK only resets the per-request timer when an `notifications/progress` arrives AND this flag is true (`shared/protocol.ts:714`). Default is `false`.

3. **OR raise `options.timeout`** explicitly to the tool's worst-case budget (e.g. `600_000` for `consensus_vote`, `900_000` for `orchestrate`). Sufficient if you don't want streaming progress, but the request will block for that long.

```ts
// Example: invoking consensus_vote from a custom MCP client
const result = await client.request(
  { method: 'tools/call', params: { name: 'consensus_vote', arguments: { ... } } },
  CallToolResultSchema,
  {
    timeout: 600_000,
    resetTimeoutOnProgress: true,
    onprogress: (notif) => console.log(`heartbeat #${notif.progress}`),
  }
);
```

### Operator diagnostic

`toSdkCallbackWithBudgetCheck` (`packages/nexus-agents/src/mcp/middleware/tool-wrapper.ts`) emits a WARN at invocation time when a tool's configured budget exceeds the SDK default AND the request arrived without `_meta.progressToken`. The WARN names the tool, the configured budget, and the SDK default — operators can grep server logs to confirm whether a "tool timed out" failure is actually a client-config mismatch rather than a real CLI failure. (Source: audit on #2619 / #2631.)

```
[warn] MCP tool budget exceeds client default and no progressToken received — request likely to be killed by client before server-side deadline
  tool=consensus_vote configuredTimeoutMs=600000 mcpSdkDefaultMs=60000
```

If you see this WARN on every long-running tool call, the client is misconfigured — fix the client, not the server timeout.

### Correlation-keyed event log (#2703)

The WARN above is also recorded as one JSONL row per mismatch at `$NEXUS_DATA_DIR/mcp-telemetry/timeout-mismatch-events.jsonl`. Each row carries a correlation `eventId` that **also appears in the WARN log entry's context**, so a mismatched call can be joined from server logs to the recorded outcome — not just counted in aggregate.

Schema (one JSON object per line):

| Field                 | Type                   | Notes                                                        |
| --------------------- | ---------------------- | ------------------------------------------------------------ |
| `eventId`             | string (UUID)          | Join key against the WARN log entry's `eventId` field        |
| `toolName`            | string                 | E.g. `consensus_vote`, `orchestrate`                         |
| `configuredTimeoutMs` | number                 | Server-side budget that triggered the mismatch               |
| `mcpSdkDefaultMs`     | number                 | `60000` — the SDK client default the budget exceeds          |
| `startedAt`           | string (ISO 8601)      | When the wrapper fired the WARN                              |
| `endedAt`             | string (ISO 8601)      | When the call returned or threw                              |
| `durationMs`          | number                 | `endedAt - startedAt`                                        |
| `outcome`             | `'success' \| 'error'` | Whether the call's eventual result was `isError: true`       |
| `errorCategory`       | string (optional)      | From the post-#2649 envelope (`_meta['nexus-agents/error']`) |
| `errorMessage`        | string (optional)      | First text-content line or thrown error, truncated to 500c   |

This is the data surface for Epic #2631's "when this is worth doing" gate: "of mismatches, what fraction end in `errorCategory: 'timeout'`?" The aggregation belongs in `improvement_review` / a fitness report (out of scope for #2703).

---

## Claude Desktop Integration

### Setup

Add to `.mcp.json` in your project root (or use `claude mcp add-json`):

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
- **SDK Version:** @modelcontextprotocol/sdk@1.27.1
- **Protocol Version:** 2025-11-25

---

## Related Documents

- **Agent System:** [AGENT_SYSTEM.md](./AGENT_SYSTEM.md)
- **Security:** [SECURITY.md](./SECURITY.md)
- **Full Architecture:** [ARCHITECTURE.md](../../ARCHITECTURE.md)
- **API Reference:** [ENTRYPOINTS.md](../ENTRYPOINTS.md)
