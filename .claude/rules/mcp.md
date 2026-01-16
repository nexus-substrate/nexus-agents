---
paths: 'packages/**/mcp/**/*.ts'
---

# MCP Server Rules

<!-- CANONICAL SOURCES:
  - CODING_STANDARDS.md Section 5
  - docs/development/TOOL_DEVELOPMENT.md
  - docs/architecture/MCP_PROTOCOL.md
-->

Quick reference for MCP patterns. **Full documentation:**

- [TOOL_DEVELOPMENT.md](../../docs/development/TOOL_DEVELOPMENT.md) - Step-by-step guide
- [MCP_PROTOCOL.md](../../docs/architecture/MCP_PROTOCOL.md) - Architecture details
- [CODING_STANDARDS.md](../../CODING_STANDARDS.md#5-mcp-server-standards) - Standards

## Protocol Version

Target: **MCP Protocol 2025-11-25**

## Tool Quick Reference

```typescript
server.tool(
  'tool_name', // verb_noun format
  {
    param: z.string().describe('Clear description for Claude'),
  },
  async (args) => {
    const validated = Schema.safeParse(args);
    if (!validated.success) {
      return { isError: true, content: [{ type: 'text', text: validated.error.message }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);
```

## Security Essentials

- Rate limit all tools
- Validate all inputs with Zod
- Sanitize outputs (no secrets)
- Path validation on file operations

See [TOOL_DEVELOPMENT.md](../../docs/development/TOOL_DEVELOPMENT.md) for complete patterns.
