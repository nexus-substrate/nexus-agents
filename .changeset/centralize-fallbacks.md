---
'nexus-agents': patch
---

refactor: centralize duplicated consensus + model-fallback constants (#3571)

Tier C of #3568 (vote-approved). Two single-source constants replace drift-prone
duplicated literals: `SUPERMAJORITY_THRESHOLD` (the 2/3 governance threshold,
previously a bare `0.67` across six consensus sites) and
`FALLBACK_CONTEXT_WINDOW`/`FALLBACK_MAX_OUTPUT` (the unknown-model fallback,
previously duplicated across the Claude/OpenCode CLI adapters,
model-to-cli-adapter, and delegate-to-model-router). Behavior is unchanged
(values identical). Per a verify-before-acting audit, the 8192-vs-200000
unknown-context defaults were left distinct (context-appropriate, not drift),
and adapter-specific pricing / provider-specific DEFAULT_MAX_TOKENS were left
per-source rather than collapsed into a wrong global.
