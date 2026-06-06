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
lives in `_meta` under `ERROR_ENVELOPE_META_KEY` (`'nexus-agents/error'`) —
**not** `structuredContent`, which the MCP client validates against the tool's
`outputSchema` even on error results. The `message` is mirrored into
`content[].text` for display. Parse it back with `parseToolErrorEnvelope(result._meta)`.
The `check:mcp-error-envelope` CI gate fails any tool that builds a raw
`{ isError: true }` literal instead of going through the helper.

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

### Tool-to-tool composition (#3201)

There are two distinct composition boundaries — pick by **where the caller runs**, not by convenience:

- **In-process (one tool's handler needs another concern's logic):** call the
  canonical **domain engine** directly — `ConsensusEngine`, `PipelineRunner`,
  `CompositeRouter`, `Orchestrator` — exactly as the Canonical Paths table
  mandates. Do **not** re-invoke a peer MCP tool's handler to get at its logic;
  the MCP wrapper is a transport/validation shell, and routing it back through
  `_meta`-envelope parsing in-process is strictly more coupling, not less.
  `consensus-vote.ts` calling `ConsensusEngine` is correct by design, not the
  coupling smell it can look like from the outside.
- **Cross-tool (an agent or the autonomous loop chains tools at the MCP
  boundary):** the consumer only ever sees the `ToolResult`. On `isError`,
  `parseToolErrorEnvelope(result._meta)` and branch on the result: retry only
  when `isRetryable` (i.e. category `transient`); on `validation` fix the args
  and re-call; on `permission`/`business`/`internal` stop and surface — never
  blind-retry. This is the only supported way for tool output to feed tool
  input, and it is exactly why the envelope is "caller-facing" above.

Rule of thumb: **engines compose inside the package; envelopes compose across
the tool boundary.** If you find a tool importing `pipeline/` or `agents/`
internals that are _not_ a canonical engine, that is the real coupling to fix —
route it through the engine, not through a peer tool.

`toolError(msg)` remains as a back-compat alias mapping to a non-retryable
`internal` envelope — acceptable for the legacy migration sweep, but new code
should call `toolStructuredError` with the correct category.

## Security Essentials

- Rate limit all tools
- Validate all inputs with Zod
- Sanitize outputs (no secrets)
- Path validation on file operations

See [TOOL_DEVELOPMENT.md](../../docs/development/TOOL_DEVELOPMENT.md) for complete patterns.
