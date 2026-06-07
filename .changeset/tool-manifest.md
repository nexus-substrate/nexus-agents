---
'nexus-agents': patch
---

refactor(mcp): single TOOL_MANIFEST as the canonical tool-name source (#3566)

Introduces `mcp/tools/tool-manifest.ts` — a pure-data leaf module whose
`TOOL_MANIFEST` array is the single source of truth for which MCP tools exist
and their registration order. `REGISTERED_TOOL_NAMES` is now a derived
re-export, the capability-gap detector's `AVAILABLE_TOOLS` derives directly from
the manifest (replacing a 46-line hand-maintained copy that was kept in lockstep
by a freshness test), and `scripts/inject-governance.ts` parses the manifest.
Because the manifest imports nothing, core modules can derive from it without
pulling in the MCP tool dependency graph — no import cycle. Parity tests assert
`REGISTERED_TOOL_NAMES`, `TOOL_ANNOTATIONS` keys, and the gap-detector list all
match the manifest, so adding/removing a tool is a one-array edit.

Annotation-data folding (so `TOOL_ANNOTATIONS` also derives) and the AST-parser
upgrade are tracked as follow-ups.
