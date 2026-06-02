---
"nexus-agents": patch
---

docs: complete both ENTRYPOINTS MCP tool enumerations (38/20 → 42, #3334)

`docs/ENTRYPOINTS.md` had two stale tool enumerations: the prose table listed
38 of 42 registered tools, and the machine-parseable `mcp_tools:` YAML block only
20. Both now list all 42 (regenerated from `REGISTERED_TOOL_NAMES`), with the
prose descriptions matching the README and per-tool `auth` (run_dev_pipeline =
optional, rest = none). Automating these via the governance injector (the
markers exist but inject-governance doesn't yet target ENTRYPOINTS) + a drift
gate remains tracked in #3334.
