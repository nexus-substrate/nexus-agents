---
'nexus-agents': patch
---

docs(architecture): add a Composability Model section to the architecture overview

Documents the three-tier model behind the 45 MCP tools — primitives,
coordinators, orchestrators — the data-flow contracts that let one tool's
output feed the next, the three composition levels (runtime / YAML /
programmatic), and a worked security-audit example traced through four tools.
Closes the gap where the architecture overview had Core Components but no
explicit composability/tiering model (#3251).
