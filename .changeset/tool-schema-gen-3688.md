---
'nexus-agents': patch
---

docs(reference): single-source per-tool MCP schemas from Zod; slim ENTRYPOINTS (#3688)

The hand-maintained ~590-line "Tool Schemas" JSON block in `docs/ENTRYPOINTS.md`
duplicated the runtime Zod input schemas and silently drifted. Per the
vote-decided Option C, that detail is now single-sourced.

- `scripts/generate-tool-reference.ts` (the existing #3687 generator) is
  re-sourced from static regex parsing to Zod v4's native
  `z.toJSONSchema(InputSchema, { io: 'input' })`. The generated per-tool pages
  in `docs/reference/tools/` gain a **Constraints** column carrying the full
  input contract — enum members (previously only an opaque `*Schema` ref name),
  minLength/maxLength, min/max (incl. exclusive), pattern, format, and
  `.default()` values. No new generator: the existing CI drift gate
  (`pnpm docs:tools:check`, the "Tool Reference Drift" job) covers it unchanged.
- `docs/ENTRYPOINTS.md`: the `### Tool Schemas` block is removed (~590 lines)
  and replaced with a link to the generated MCP Tool Reference. The curated
  index (Overview, Quick Reference, CLI Commands, the auto-injected MCP tool
  list, Usage Examples, Workflow Templates) is unchanged.
- Adds `scripts/generate-tool-reference.test.ts` asserting the constraint
  extraction and the committed-vs-fresh drift contract.

Docs-only; no CLI command or MCP tool added or changed.
