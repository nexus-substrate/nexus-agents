---
'nexus-agents': patch
---

fix(indexer): resolve MCP tool description/inputSchema identifiers from enclosing scope

The entrypoint MCP extractor resolved shorthand `{ description }` and
`inputSchema: toolSchema` references via `sourceFile.getVariableDeclaration()`,
which only searches top-level declarations. The dominant tool pattern declares
`const description` / `const toolSchema` INSIDE the `registerXTool(...)`
function, so these silently resolved to empty — shipping 27 MCP tools (incl.
`extract_symbols`, `search_codebase`, `repo_analyze`) with `description: ''` in
`docs/.generated/entrypoints.yaml`.

Identifiers are now resolved through the type-checker symbol across all
enclosing scopes, and string concatenations are read statically. A warning is
now emitted when a tool resolves to BOTH an empty description and empty
parameters (the silent-empty class, #2153). Regenerating the manifest drops the
empty-description count from 27 to 1 (the remaining `run_pipeline` uses a runtime
template-literal description the extractor cannot resolve statically, and is now
flagged by the warning).
