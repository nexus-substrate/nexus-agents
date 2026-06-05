---
'nexus-agents': patch
---

docs(entrypoints): auto-generate ENTRYPOINTS.md tool enumerations + drift-gate (#3334)

`docs/ENTRYPOINTS.md`'s prose MCP-tools table and machine-parseable YAML block
are now generated from `REGISTERED_TOOL_NAMES` + `TOOL_DESCRIPTIONS` by
`inject-governance.ts` (both `inject` and `check`/CI modes), so they can no
longer drift from the registered tool set by hand. Both enumerations now list all
45 tools (were 42/42 on disk; the audit's 38/20 figures were already stale). The
count derives from `REGISTERED_TOOL_NAMES.length` — nothing hardcoded.
