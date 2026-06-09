---
'nexus-agents': patch
---

refactor(governance): inject-governance.ts parses the MCP tool manifest via a TypeScript AST walk instead of a line-oriented regex (#3596). The new `scripts/parse-tool-manifest.ts` finds the canonical `TOOL_MANIFEST` array (then `REGISTERED_TOOL_NAMES`, then a legacy `tools:` property) and returns its string-literal elements in source order — formatting-agnostic (comments between elements, single-line arrays, quote style) and the seam that lets the list become fully derived later, which a regex over a literal cannot read. Output is byte-identical (governance:check unchanged at 46 tools); the parser carries 9 fixture unit tests.
