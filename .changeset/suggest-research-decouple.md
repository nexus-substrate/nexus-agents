---
'nexus-agents': patch
---

fix(mcp): decouple suggest_research_tasks gap path from slow research (#3606)

`suggest_research_tasks` awaited the external research-discovery path and the
synchronous capability-gap path together, so a slow/failing `research_discover`
(external APIs) timed out the whole tool and dropped the fast gap candidates too.
Now the gap candidates compute first, and research is bounded by an internal
budget (20s, under the MCP wrapper timeout) — on timeout or error the tool
returns PARTIAL results (gap candidates, empty research candidates, and a
`researchTimedOut` flag) instead of failing. Found during the 2.123.4
e2e-validation pass.
