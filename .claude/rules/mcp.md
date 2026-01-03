---
paths: "packages/mcp/**/*.ts"
---

# MCP Server Rules

## Protocol Version

Target: MCP Protocol 2025-11-25

## Tool Definition

```typescript
server.tool(
  'tool_name',  // verb_noun format
  {
    // Zod schema with descriptions
    param: z.string().describe('Clear description for Claude'),
  },
  async (args) => {
    // 1. Validate early
    const validated = Schema.safeParse(args);
    if (!validated.success) {
      return { isError: true, content: [{ type: 'text', text: validated.error.message }] };
    }

    // 2. Execute
    const result = await execute(validated.data);

    // 3. Return structured content
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);
```

## Tool Naming

- Use `verb_noun` format: `create_expert`, `run_workflow`
- Be descriptive - Claude uses names to decide when to call
- Avoid abbreviations

## Error Handling

- Tool errors: `{ isError: true, content: [...] }`
- Protocol errors: Throw standard JSON-RPC errors
- Always include actionable error messages

## Security

- Rate limit all tools
- Validate all inputs with Zod
- Sanitize outputs (no secrets)
- Path validation on file operations
