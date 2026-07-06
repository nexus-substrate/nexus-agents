---
'nexus-agents': patch
---

Fix `search_codebase` silently truncating results for files more than 4 directory levels below the search root (#4243). `CodebaseIndex.index()` was hardcoded to a max recursion depth of 4; the MCP tool now exposes a `maxDepth` input (default 24, clamped to 64) and reports how many directories were skipped for exceeding the depth limit directly in the tool output, so truncation is visible instead of producing an authoritative-sounding "No symbols matching" false negative.

Also corrects two inaccurate tool descriptions: `search_codebase` now states it searches an index of declared symbol NAMES (declarations only — not usages, call-sites, comments, or string content), and `extract_symbols` now correctly says it parses with the TypeScript compiler API instead of the never-used "tree-sitter".
