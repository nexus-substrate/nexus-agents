---
paths: ['packages/**/mcp/**/*.ts']
description: Adding or modifying MCP tools — schemas, error envelopes, registration
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
      return toolStructuredError({
        errorCategory: 'validation',
        message: `Validation error: ${formatZodError(validated.error)}`,
      });
    }
    return toolSuccessStructured(result);
  }
);
```

## Error Envelope Contract (#2649)

Every error return (`isError: true`) MUST carry a structured envelope, built
via `toolStructuredError(...)` from `src/mcp/error-envelope.ts`. The envelope
lives in `structuredContent.error`; the `message` is mirrored into
`content[].text` for display. The `check:mcp-error-envelope` CI gate fails any
tool that returns `isError: true` without a parseable envelope.

```typescript
toolStructuredError({
  errorCategory: 'validation', // see taxonomy below
  message: 'human-readable summary (≤ 2000 chars)',
  isRetryable: false, // optional — derived from category if omitted
  detail: { field: 'url' }, // optional structured context
});
```

**Category taxonomy** — caller-facing resolution, "what recovery path?":

| Category     | Meaning                                                | `isRetryable` default |
| ------------ | ------------------------------------------------------ | --------------------- |
| `transient`  | Network blip, rate limit, timeout — retry is safe      | `true`                |
| `validation` | Input shape/values wrong — caller must fix its args    | `false`               |
| `permission` | Auth / authorization / sandbox / access-policy denial  | `false`               |
| `business`   | Domain-logic refusal (dedup hit, precondition not met) | `false`               |
| `internal`   | Unexpected, bug-class — escalate, do not retry         | `false`               |

`business` is an expected, non-bug outcome (e.g. `research_add` finds the
paper already exists) — distinct from `internal`, and distinct from
`permission` (which is an access-control denial, not a domain refusal).

**Scope — caller-facing only.** This envelope is NOT consumed by the
routing/circuit-breaker layer, which keeps its own granular 11-value
`OutcomeFailureCategory` (`orchestration/outcomes/outcome-types.ts`) and
classifies adapter subprocess failures through `categorizeOutcomeError()`.
When a tool has caught an already-classified routing error and wants to
surface it, `coarsenFailureCategory()` is the single authoritative one-way
projection from the 11-value taxonomy to the 5-value one — never the reverse.

**`detail` is not output-sanitized.** Never put secrets, credentials,
absolute filesystem paths, or raw `Error`/response objects in `detail`.

`toolError(msg)` remains as a back-compat alias mapping to a non-retryable
`internal` envelope — acceptable for the legacy migration sweep, but new code
should call `toolStructuredError` with the correct category.

## Security Essentials

- Rate limit all tools
- Validate all inputs with Zod
- Sanitize outputs (no secrets)
- Path validation on file operations

See [TOOL_DEVELOPMENT.md](../../docs/development/TOOL_DEVELOPMENT.md) for complete patterns.
