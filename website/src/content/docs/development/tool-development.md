---
title: 'MCP Tool Development Guide'
description: 'This guide walks through creating new MCP tools for nexus-agents. Tools follow the MCP 2025-11-25 specification and use Zod for input validation.'
---

---

## Overview

This guide walks through creating new MCP tools for nexus-agents. Tools follow the MCP 2025-11-25 specification and use Zod for input validation.

---

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

---

## Creating a New Tool

### Step 1: Define Input Schema

```typescript
// src/mcp/tools/my-tool.ts
import { z } from 'zod';

const MyToolInputSchema = z.object({
  // Required parameters
  query: z.string().min(1).describe('Search query to execute'),

  // Optional parameters
  limit: z.number().min(1).max(100).default(10).describe('Maximum results to return'),

  // Enum parameters
  format: z.enum(['json', 'text', 'markdown']).default('text').describe('Output format'),
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
- Find specific items
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

---

## Tool Design Patterns

### Pattern 1: Direct Registration

For simple tools, register directly with the server:

```typescript
server.tool(
  'simple_tool',
  {
    param: z.string().describe('What this does'),
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
function createMyTool(deps: { adapter: IModelAdapter }): ITool {
  return {
    name: 'my_tool',
    description: '...',
    inputSchema: Schema,
    async execute(input) {
      // Use deps.adapter
      const response = await deps.adapter.complete(request);
      return { content: [{ type: 'text', text: response }] };
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
    return { isError: true, content: [{ type: 'text', text: parsed.error.message }] };
  }

  // Validate resource exists
  const exists = await resourceExists(parsed.data.path);
  if (!exists) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Resource not found' }],
    };
  }

  // Load and process
  const content = await loadResource(parsed.data.path);
  return { content: [{ type: 'text', text: content }] };
}
```

---

## Error Handling

### Tool Errors vs Protocol Errors

| Type               | Use `isError: true` | Throw Exception |
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

---

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
      content: [{ type: 'text', text: 'Invalid path' }],
    };
  }

  // Safe to use validPath.value
}
```

### Input Sanitization

```typescript
// Use Zod for type validation
const Schema = z.object({
  // Never allow arbitrary regex
  pattern: z.string().regex(/^[a-zA-Z0-9_-]+$/),

  // Limit string lengths
  content: z.string().max(10000),

  // Validate URLs
  url: z.string().url(),
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
      content: [{ type: 'text', text: 'Rate limit exceeded. Try again later.' }],
    };
  }

  // Proceed with execution
}
```

---

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
  });

  it('should handle missing optional parameters', async () => {
    const result = await myTool.execute({
      query: 'test',
    });

    expect(result.isError).toBeFalsy();
  });
});
```

### Integration Tests

```typescript
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

describe('my_tool integration', () => {
  let client: Client;
  let server: Server;

  beforeEach(async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    server = createServer();
    client = new Client({ name: 'test-client' });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  it('should execute via MCP protocol', async () => {
    const result = await client.callTool({
      name: 'my_tool',
      arguments: { query: 'test' },
    });

    expect(result.isError).toBe(false);
    expect(result.content).toHaveLength(1);
  });
});
```

---

## Tool Description Guidelines

Good descriptions help Claude decide when to use your tool:

```typescript
// Good description
description: `Analyze code files for security vulnerabilities.

Use this tool when:
- Reviewing code for security issues
- Checking for common vulnerability patterns
- Auditing authentication/authorization code

Parameters:
- files: List of file paths to analyze (required)
- severity: Minimum severity to report (default: medium)

Returns:
- List of vulnerabilities found with severity and remediation`;

// Bad description
description: 'Analyze files'; // Too vague
```

---

## Source Files

| File                 | Purpose              |
| -------------------- | -------------------- |
| `src/mcp/index.ts`   | Server creation      |
| `src/mcp/tools/`     | Tool implementations |
| `src/mcp/types.ts`   | Type definitions     |
| `src/mcp/resources/` | Resource handlers    |

---

## Related Documents

- **MCP Architecture:** [MCP_PROTOCOL.md](/nexus-agents/architecture/mcp-protocol/)
- **Security:** [SECURITY.md](/nexus-agents/architecture/security/)
- **API Reference:** [CLI Usage](/nexus-agents/guides/cli-usage/)
