---
'nexus-agents': patch
---

Consolidate the two duplicate `TOOL_ANNOTATIONS` registries into one (#3358). The MCP-hints registry (`mcp/tool-annotations.ts`) and the side-effects registry (`mcp/tools/tool-annotations.ts`) each required a per-tool entry, and had silently **drifted** on 9 hint values across 7 tools. The side-effects superset is now the single source of truth; `getToolAnnotations`/`getMcpAnnotations` derive from it (same signatures — callers unchanged), and the curated side-effects metadata is preserved. This also corrects several inaccurate live hints, e.g. `registry_import` is now `readOnlyHint: false` (it writes a draft entry) and `issue_triage` is now `readOnlyHint: true` (it only reads/classifies). Adding a new MCP tool now requires exactly one annotation entry instead of two.
