---
'nexus-agents': patch
---

Drift cleanups — round 1 of the #2720 umbrella ([#2715](https://github.com/williamzujkowski/nexus-agents/issues/2715), [#2728](https://github.com/williamzujkowski/nexus-agents/issues/2728), plus a 7th drift instance uncovered along the way).

**#2715 — `createAllBuiltInExperts` now derives from `BUILT_IN_EXPERTS` keys.** The previous hardcoded 9-element list silently dropped `infrastructure-expert`, `qa-expert`, and `data-visualization-expert` from the runtime registry even though `expert list` advertised all 12. A drift test now pins `result.value.length === Object.keys(BUILT_IN_EXPERTS).length` so adding a future expert in `expert-config.ts` can't silently miss the factory.

**#2728 — `run_pipeline` description now reads `listTemplateIds()` dynamically.** The MCP tool description had hardcoded the pre-`general` 4-template list; now it can't drift from `PIPELINE_TEMPLATES`.

**Surfaced en route: a 6-way `AgentRoleSchema` drift cluster.** Fixing #2715 made `createAllBuiltInExperts` actually instantiate the previously-dropped 3 experts — at which point `BaseAgentOptionsSchema.role` (`agents/agent-schemas.ts:95`) rejected `qa_expert` and `data_visualization_expert` as invalid roles. The canonical `AgentRole` type in `core/types/agent.ts:18` includes them; this one Zod copy didn't. Patched here so the experts actually load; the full 6-copy consolidation is tracked in #2720.

Other drifting `AgentRoleSchema` definitions (NOT touched in this PR — each one needs its own review):

- `workflows/workflow-types.ts:52` — 8 values (missing 9 from canonical)
- `workflows/template-types.ts:112` — 13 values
- `skills/skill-security-schemas.ts:33` — 11 values
- `agents/experts/expert-config.ts:95` — 14 values

Same enum, six different copies, none in full agreement. The right fix is one `AgentRoleSchema = z.enum(AGENT_ROLES)` derived from the canonical `AgentRole` type — left for a follow-up because changing schemas in `workflows/` may affect serialized workflow templates.
