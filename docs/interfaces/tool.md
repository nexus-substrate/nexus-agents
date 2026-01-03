# ITool Interface

## Purpose

`ITool` defines the contract for MCP (Model Context Protocol) tools that Claude can invoke. Tools provide specific functionality like file operations, expert queries, or workflow execution.

## Contract

```typescript
interface ITool {
  /** Tool name (verb_noun format, e.g., 'create_expert') */
  readonly name: string;

  /** Tool description (Claude uses this to decide when to call) */
  readonly description: string;

  /** Zod schema for input validation */
  readonly inputSchema: ZodSchema;

  /** Optional Zod schema for output validation */
  readonly outputSchema?: ZodSchema;

  /**
   * Execute the tool.
   * @param input - Validated input
   * @returns Result with ToolResult or ToolError
   */
  execute(input: unknown): Promise<Result<ToolResult, ToolError>>;
}
```

## Supporting Types

### ToolResult

```typescript
interface ToolResult {
  content: ToolContentBlock[];
  isError?: boolean;
  structuredContent?: unknown;
}
```

### ToolContentBlock

```typescript
type ToolContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'resource'; uri: string; mimeType?: string; text?: string };
```

### ToolError

```typescript
class ToolError extends Error {
  readonly toolName: string;
  readonly input?: unknown;
}
```

## IToolRegistry Interface

```typescript
interface IToolRegistry {
  register(tool: ITool): void;
  get(name: string): ITool | undefined;
  list(): ToolInfo[];
  validate(name: string, input: unknown): Result<unknown, ValidationError>;
}
```

## Implementation Example

```typescript
import { z } from 'zod';
import { type ITool, type ToolResult, ok, err, ToolError } from '@nexus-agents/core';

const ReadFileSchema = z.object({
  path: z.string().describe('File path to read'),
  encoding: z.enum(['utf-8', 'base64']).default('utf-8').describe('File encoding'),
});

export const readFileTool: ITool = {
  name: 'read_file',
  description: 'Read contents of a file. Use for examining code, configs, or documents.',
  inputSchema: ReadFileSchema,

  async execute(input: unknown): Promise<Result<ToolResult, ToolError>> {
    const validated = ReadFileSchema.safeParse(input);
    if (!validated.success) {
      return err(new ToolError(validated.error.message, 'read_file', input));
    }

    try {
      const content = await fs.readFile(validated.data.path, validated.data.encoding);
      return ok({
        content: [{ type: 'text', text: content }],
      });
    } catch (error) {
      return err(
        new ToolError(
          `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'read_file',
          input
        )
      );
    }
  },
};
```

## MCP Server Integration

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

// Register tool with MCP server
server.tool(
  'orchestrate',
  {
    task: z.string().describe('Task description for the orchestrator'),
    context: z.record(z.unknown()).optional().describe('Additional context'),
  },
  async (args) => {
    const result = await orchestrateTool.execute(args);

    if (!result.ok) {
      return {
        isError: true,
        content: [{ type: 'text', text: result.error.message }],
      };
    }

    return result.value;
  }
);
```

## Tool Design Guidelines

### Naming Convention

Use `verb_noun` format:

- `create_expert` - Creates a new expert agent
- `run_workflow` - Executes a workflow
- `read_file` - Reads file contents
- `list_experts` - Lists available experts

### Description Best Practices

Claude uses descriptions to decide when to call tools:

```typescript
// Good: Specific, actionable
description: 'Analyze code for security vulnerabilities. Use when reviewing code for potential security issues like injection, XSS, or authentication flaws.';

// Bad: Vague, unhelpful
description: 'Checks code.';
```

### Input Schema Design

```typescript
// Include clear descriptions
const schema = z.object({
  task: z.string().min(1).describe('What you want the expert to do'),
  expert: z.enum(['code', 'security', 'architecture']).describe('Which expert to use'),
  priority: z.number().min(1).max(10).default(5).describe('Task priority (1-10)'),
});
```

## Built-in Tools

| Tool           | Description                  | Input                  |
| -------------- | ---------------------------- | ---------------------- |
| `orchestrate`  | Delegate task to expert team | `{ task, context? }`   |
| `run_workflow` | Execute a workflow template  | `{ template, inputs }` |
| `list_experts` | List available experts       | `{}`                   |
| `get_status`   | Get execution status         | `{ executionId }`      |

## Error Handling

| Error             | Cause                 | Recovery              |
| ----------------- | --------------------- | --------------------- |
| `ToolError`       | Tool execution failed | Check input/fix issue |
| `ValidationError` | Invalid input         | Fix input format      |
| `TimeoutError`    | Tool timed out        | Retry or escalate     |

## Testing

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { ITool } from '@nexus-agents/core';

describe('ITool', () => {
  it('should validate input and execute', async () => {
    const mockTool: ITool = {
      name: 'test_tool',
      description: 'Test tool',
      inputSchema: z.object({ value: z.string() }),
      execute: vi.fn().mockResolvedValue({
        ok: true,
        value: { content: [{ type: 'text', text: 'result' }] },
      }),
    };

    const result = await mockTool.execute({ value: 'test' });
    expect(result.ok).toBe(true);
    expect(mockTool.execute).toHaveBeenCalledWith({ value: 'test' });
  });

  it('should return error for invalid input', async () => {
    const tool = createRealTool();
    const result = await tool.execute({ invalid: 'input' });
    expect(result.ok).toBe(false);
  });
});
```

## Security Considerations

1. **Input Validation** - Always validate with Zod at tool boundary
2. **Path Safety** - Validate paths to prevent traversal attacks
3. **Rate Limiting** - Apply limits to prevent abuse
4. **Output Sanitization** - Remove secrets before returning

```typescript
// Secure tool implementation
async execute(input: unknown): Promise<Result<ToolResult, ToolError>> {
  // 1. Validate input
  const validated = Schema.safeParse(input);
  if (!validated.success) {
    return err(new ToolError(validated.error.message, this.name, input));
  }

  // 2. Security checks
  const pathResult = validatePath(validated.data.path, ALLOWED_ROOT);
  if (!pathResult.ok) {
    return err(new ToolError('Invalid path', this.name, input));
  }

  // 3. Execute with timeout
  const result = await withTimeout(doWork(validated.data), 30000);

  // 4. Sanitize output
  return ok({
    content: [{ type: 'text', text: sanitize(result) }],
  });
}
```
