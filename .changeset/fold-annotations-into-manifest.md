---
'nexus-agents': patch
---

refactor(tools): fold per-tool annotation + side-effect data into the canonical `TOOL_MANIFEST` (#3597, increment 2 of #3563). Manifest entries are now `{ name, annotations, sideEffects }` objects, and `TOOL_ANNOTATIONS` + `getToolAnnotations`/`getMcpAnnotations` derive from the manifest (single source of truth; annotation types defined on the import-free leaf). Every annotation value is preserved byte-for-byte (verified against a pre-refactor golden master — zero value mismatches across all 46 tools). The AST manifest parser (#3596) and all pipeline scripts that read tool names now handle the object shape; governance:check stays at 46 tools, docs:tools:check at 47 files. No behavior change for any tool's MCP hints.
