---
'nexus-agents': patch
---

docs(tools): generate the MCP tool reference into the Astro docs site (#3687)

Add `scripts/generate-tool-reference.ts` (npm: `docs:tools` / `docs:tools:check`),
which emits a per-tool MCP reference (name, one-line description, input-parameter
summary) for every registered tool into the Astro `docs` content collection at
`docs/reference/tools/`. The data is sourced from existing single-source surfaces
— `TOOL_MANIFEST`, `TOOL_DESCRIPTIONS`, and each tool's exported `*InputSchema`
Zod object — so the reference cannot drift from the runtime tools. Composes with
the existing doc tooling (reuses the description-drift gate's string parser,
follows the `generate-docs-content.ts` generate+`--check` pattern, and lands in
the #3686 spike's Astro `docs` collection). The `--check` mode is wired so the
CI drift gate (#3689) can adopt it without further changes.
