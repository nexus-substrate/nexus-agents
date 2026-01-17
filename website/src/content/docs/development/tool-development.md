---
title: MCP Tool Development
description: Create custom MCP tools with Zod validation for nexus-agents.
---

This guide covers creating new MCP tools for nexus-agents. Tools follow the MCP 2025-11-25 specification and use Zod for input validation.

## Tool Architecture

### Core Interface

```typescript
interface ITool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: z.ZodSchema;

  execute(input: unknown): Promise<ToolResult>;
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

## Creating a New Tool

### Step 1: Define Input Schema

Use Zod for comprehensive input validation:

```typescript
// src/mcp/tools/my-tool.ts
import { z } from 'zod';

const MyToolInputSchema = z.object({
  // Required parameters
  query: z.string().min(1).describe('Search query to execute'),

  // Optional parameters with defaults
  limit: z.number().min(1).max(100).default(10).describe('Maximum results to return'),

  // Enum parameters
  format: z.enum(['json', 'text', 'markdown']).default('text').describe('Output format'),

  // Optional nested object
  options: z
    .object({
      verbose: z.boolean().default(false),
      includeMetadata: z.boolean().default(true),
    })
    .optional(),
});

type MyToolInput = z.infer<typeof MyToolInputSchema>;
```

### Step 2: Implement Tool Class

```typescript
import type { ITool, ToolResult } from '../types.js';

export const myTool: ITool = {
  name: 'my_tool',
  description: `Search for items matching a query.

Use this tool when you need to:
- Find specific items in the codebase
- Search by criteria

Parameters:
- query: The search query (required)
- limit: Maximum results (default: 10)
- format: Output format (default: text)`,

  inputSchema: MyToolInputSchema,

  async execute(input: unknown): Promise<ToolResult> {
    // 1. Validate input
    const parsed = MyToolInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Validation error: ${parsed.error.message}`,
          },
        ],
      };
    }

    const { query, limit, format } = parsed.data;

    try {
      // 2. Execute tool logic
      const results = await searchItems(query, limit);

      // 3. Format output
      const output = formatResults(results, format);

      return {
        content: [{ type: 'text', text: output }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  },
};
```

### Step 3: Register Tool

```typescript
// src/mcp/tools/index.ts
import { myTool } from './my-tool.js';

export function registerTools(server: McpServer, registry: IToolRegistry): void {
  registry.register(myTool);
  // ... other tools
}
```

## Tool Design Patterns

### Pattern 1: Direct Server Registration

For simple tools, register directly with the MCP server:

```typescript
server.tool(
  'simple_tool',
  {
    param: z.string().describe('What this parameter does'),
  },
  async (args) => {
    return {
      content: [{ type: 'text', text: 'Result' }],
    };
  }
);
```

### Pattern 2: Factory Pattern

For tools with dependencies:

```typescript
function createAnalysisTool(deps: { adapter: IModelAdapter }): ITool {
  return {
    name: 'analyze_code',
    description: 'Analyze code with AI assistance',
    inputSchema: AnalysisSchema,
    async execute(input) {
      const parsed = AnalysisSchema.parse(input);

      // Use injected adapter
      const response = await deps.adapter.complete({
        messages: [{ role: 'user', content: parsed.code }],
      });

      return {
        content: [{ type: 'text', text: response.value.content }],
      };
    },
  };
}
```

### Pattern 3: Async Resource Loading

For tools that need to load resources:

```typescript
async execute(input: unknown): Promise<ToolResult> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) {
    return {
      isError: true,
      content: [{ type: 'text', text: parsed.error.message }],
    };
  }

  // Validate resource exists before loading
  const exists = await resourceExists(parsed.data.path);
  if (!exists) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Resource not found' }],
    };
  }

  // Load and process
  const content = await loadResource(parsed.data.path);
  return {
    content: [{ type: 'text', text: content }],
  };
}
```

## Error Handling

### Tool Errors vs Protocol Errors

| Error Type         | Use `isError: true` | Throw Exception |
| ------------------ | ------------------- | --------------- |
| Invalid input      | Yes                 | No              |
| Resource not found | Yes                 | No              |
| Rate limited       | Yes                 | No              |
| Internal error     | No                  | Yes             |
| Protocol error     | No                  | Yes             |

### Error Response Pattern

```typescript
// Recoverable error (tool error)
return {
  isError: true,
  content: [
    {
      type: 'text',
      text: 'Validation failed: query cannot be empty',
    },
  ],
};

// Unrecoverable error (protocol error)
throw new McpError(ErrorCode.InternalError, 'Database connection failed');
```

### Structured Error Responses

```typescript
function createErrorResponse(
  code: string,
  message: string,
  details?: Record<string, unknown>
): ToolResult {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            error: {
              code,
              message,
              details,
              timestamp: new Date().toISOString(),
            },
          },
          null,
          2
        ),
      },
    ],
  };
}

// Usage
return createErrorResponse('VALIDATION_ERROR', 'Invalid input parameters', {
  field: 'query',
  issue: 'must not be empty',
});
```

## Security Considerations

### Path Traversal Prevention

```typescript
import { validatePath } from '../../security/path-validator.js';

async execute(input: unknown): Promise<ToolResult> {
  const { filePath } = Schema.parse(input);

  // Validate path is within allowed directory
  const validPath = validatePath(filePath, process.cwd());
  if (!validPath.ok) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Invalid path: access denied' }],
    };
  }

  // Safe to use validPath.value
  const content = await readFile(validPath.value);
  return { content: [{ type: 'text', text: content }] };
}
```

### Input Sanitization

```typescript
// Use Zod for strict type validation
const Schema = z.object({
  // Never allow arbitrary regex (ReDoS prevention)
  pattern: z.string().regex(/^[a-zA-Z0-9_-]+$/),

  // Limit string lengths
  content: z.string().max(10000),

  // Validate URLs
  url: z.string().url(),

  // Restrict to allowed values
  action: z.enum(['read', 'list', 'search']),
});
```

### Rate Limiting

```typescript
import { rateLimiter } from '../../security/rate-limiter.js';

async execute(input: unknown): Promise<ToolResult> {
  // Check rate limit before execution
  if (!rateLimiter.consume('my_tool', 1)) {
    return {
      isError: true,
      content: [{
        type: 'text',
        text: 'Rate limit exceeded. Try again in 60 seconds.',
      }],
    };
  }

  // Proceed with execution
  // ...
}
```

## Testing MCP Tools

### Unit Tests

```typescript
// src/mcp/tools/my-tool.test.ts
import { describe, it, expect } from 'vitest';
import { myTool } from './my-tool.js';

describe('my_tool', () => {
  it('should handle valid input', async () => {
    const result = await myTool.execute({
      query: 'test',
      limit: 5,
    });

    expect(result.isError).toBeFalsy();
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
  });

  it('should return error for invalid input', async () => {
    const result = await myTool.execute({
      query: '', // Empty string should fail
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Validation');
  });

  it('should handle missing optional parameters', async () => {
    const result = await myTool.execute({
      query: 'test',
      // limit and format use defaults
    });

    expect(result.isError).toBeFalsy();
  });

  it('should respect rate limits', async () => {
    // Exhaust rate limit
    for (let i = 0; i < 100; i++) {
      await myTool.execute({ query: 'test' });
    }

    const result = await myTool.execute({ query: 'test' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Rate limit');
  });
});
```

### Integration Tests

```typescript
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

describe('my_tool integration', () => {
  let client: Client;
  let server: Server;

  beforeEach(async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    server = createServer();
    client = new Client({ name: 'test-client', version: '1.0.0' });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  it('should execute via MCP protocol', async () => {
    const result = await client.callTool({
      name: 'my_tool',
      arguments: { query: 'test' },
    });

    expect(result.isError).toBe(false);
    expect(result.content).toHaveLength(1);
  });

  it('should list tool in capabilities', async () => {
    const tools = await client.listTools();
    const myTool = tools.tools.find((t) => t.name === 'my_tool');

    expect(myTool).toBeDefined();
    expect(myTool?.description).toContain('Search');
  });
});
```

## Tool Description Guidelines

Good descriptions help Claude decide when to use your tool:

```typescript
// Good description - Clear, specific, with examples
description: `Analyze code files for security vulnerabilities.

Use this tool when:
- Reviewing code for security issues
- Checking for common vulnerability patterns (XSS, SQL injection)
- Auditing authentication/authorization code

Do NOT use this tool for:
- Performance analysis (use analyze_performance instead)
- Code style checks (use lint_code instead)

Parameters:
- files: List of file paths to analyze (required)
- severity: Minimum severity to report (default: medium)
- categories: Vulnerability categories to check (default: all)

Returns:
- List of vulnerabilities with severity, location, and remediation advice
- Summary statistics by category`;

// Bad description - Too vague
description: 'Analyze files';
```

### Description Checklist

- Clearly state what the tool does
- List when to use the tool
- List when NOT to use the tool (if alternatives exist)
- Document all parameters with types and defaults
- Describe the output format

## Advanced Patterns

### Streaming Results

For long-running tools that produce incremental output:

```typescript
async execute(input: unknown): Promise<ToolResult> {
  const parsed = Schema.parse(input);
  const results: string[] = [];

  // Process incrementally
  for await (const item of processItems(parsed.items)) {
    results.push(formatItem(item));

    // Could emit progress events here
    // eventBus.emit({ topic: 'tool.progress', ... });
  }

  return {
    content: [{
      type: 'text',
      text: results.join('\n'),
    }],
  };
}
```

### Tool Composition

Combine multiple tools for complex operations:

```typescript
async execute(input: unknown): Promise<ToolResult> {
  const parsed = Schema.parse(input);

  // Step 1: Search
  const searchResult = await searchTool.execute({
    query: parsed.query,
  });

  if (searchResult.isError) {
    return searchResult;
  }

  // Step 2: Analyze each result
  const items = parseSearchResults(searchResult);
  const analyses = await Promise.all(
    items.map(item => analyzeTool.execute({ item }))
  );

  // Step 3: Combine results
  return {
    content: [{
      type: 'text',
      text: formatCombinedResults(analyses),
    }],
  };
}
```

### Context-Aware Tools

Tools that use session or agent context:

```typescript
function createContextAwareTool(contextManager: ContextManager): ITool {
  return {
    name: 'context_search',
    description: 'Search within current session context',
    inputSchema: Schema,
    async execute(input) {
      const parsed = Schema.parse(input);

      // Get current context
      const context = contextManager.getCurrentContext();

      // Search within context
      const results = searchInContext(context, parsed.query);

      return {
        content: [{ type: 'text', text: JSON.stringify(results) }],
      };
    },
  };
}
```

## Source Files

| File                     | Purpose              |
| ------------------------ | -------------------- |
| `src/mcp/index.ts`       | Server creation      |
| `src/mcp/tools/`         | Tool implementations |
| `src/mcp/tools/index.ts` | Tool registration    |
| `src/mcp/types.ts`       | Type definitions     |
| `src/core/types/tool.ts` | ITool interface      |

## Next Steps

- [Agent Development](/development/agent-development) - Create agents that use tools
- [Memory Development](/development/memory-development) - Add persistence to tools
- [MCP Integration](/guides/mcp-integration) - Configure MCP server
