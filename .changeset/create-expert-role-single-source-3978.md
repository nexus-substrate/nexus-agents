---
'nexus-agents': patch
---

fix(mcp): single-source create_expert role enum + expose data_visualization_expert

The `create_expert` MCP tool's registered `role` enum had drifted from the
exported `CreateExpertInputSchema`: the runtime `toolSchema.role` (what MCP
clients see) listed only 10 roles, omitting `data_visualization_expert`, while
the exported schema admitted 11. The omitted role is a real, fully-configured
built-in expert (#2715), so clients could not create it despite the exported
contract allowing it.

- Extract one canonical `CREATE_EXPERT_ROLES` const and derive BOTH the exported
  `CreateExpertInputSchema.role` and the registered `toolSchema.role` from it, so
  the two enums can no longer diverge. `data_visualization_expert` is now in the
  single source.
- Update the runtime description and the `tool-descriptions-data.ts` doc-table
  entry to mention infrastructure and data visualization (keeps the
  MCP-description-drift gate green).
- Add a parity test asserting registered enum === exported enum ===
  `CREATE_EXPERT_ROLES` (set-equality), that `data_visualization_expert` is
  creatable, and that every creatable role maps to a real configured expert.
