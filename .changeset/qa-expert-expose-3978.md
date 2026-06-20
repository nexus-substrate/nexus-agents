---
'nexus-agents': patch
---

fix(mcp): expose qa_expert via create_expert (owner-approved follow-up to #3978)

`qa_expert` is a real, fully-configured built-in expert (`BUILT_IN_EXPERTS['qa']`
→ "Quality Assurance Expert", `role: 'qa_expert'`, `EXPERT_TYPE_TO_ROLE['qa'] =
'qa_expert'`) but was deliberately omitted from the `create_expert` MCP tool's
creatable-role list. This adds it so MCP clients can create a QA expert ad hoc,
mirroring the data_visualization_expert exposure (#3978).

- Add `'qa_expert'` to the single-source `CREATE_EXPERT_ROLES` const, so both the
  exported `CreateExpertInputSchema.role` and the registered `toolSchema.role`
  pick it up via the single source (#3981 parity invariant preserved).
- Update the runtime tool description and the `tool-descriptions-data.ts`
  doc-table entry to mention quality assurance (QA), keeping the
  MCP-description-drift gate green.
- Re-inject governed docs: `docs/ENTRYPOINTS.md` create_expert enumeration and
  the generated `docs/reference/tools/create_expert.md` role enum now include
  `qa_expert`.

The #3981 parity test asserts registered enum === exported enum ===
`CREATE_EXPERT_ROLES` and that every creatable role maps to a real configured
`BuiltInExpertType`; both hold with `qa_expert` added.
