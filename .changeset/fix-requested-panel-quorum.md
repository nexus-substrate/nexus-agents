---
'nexus-agents': patch
---

Fix CLI and MCP consensus votes using `absolute_quorum` to report `no_quorum` when requested voters return no result, including when the entire panel is missing. Missing seats now void the verdict just like errored seats.
