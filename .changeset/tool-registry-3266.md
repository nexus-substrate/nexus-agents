---
'nexus-agents': patch
---

refactor(mcp): table-driven MCP tool registration seeded from `TOOL_MANIFEST` (#3266)

Collapse the per-tool registration wiring in `cli-server-tools.ts` (the partial
`STANDALONE_TOOLS` table + five grouped helper functions + the category-dispatch
`registerToolCategories`) into a single declarative `HANDLER_TABLE` keyed by
`RegisteredToolName` and driven off the canonical `TOOL_MANIFEST`. Adding a tool
now needs one manifest entry plus one handler row. `TOOL_MANIFEST` stays the
single source of truth; the registry derives from it, and
`assertHandlerManifestParity` fails loudly at registration if the table and the
manifest disagree (a manifest entry with no handler, or a handler with no
manifest entry). No module-load self-registration, no dynamic-extension export —
tools remain statically declared. Behaviour-preserving: same 46 tools, same
order, same shared-instance wiring (expert registry, workflow engine), same
annotations/side-effects/tiers. MCP_TOOL_COUNT guard unchanged at 46.
