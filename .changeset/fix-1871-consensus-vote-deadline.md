---
'nexus-agents': patch
---

fix(consensus): add overall wall-clock deadline to consensus_vote (#1871)

`consensus_vote` could hang indefinitely when a single agent vote promise never settled (e.g. subprocess adapter hang), because per-vote timeouts could be bypassed and `Promise.all()` waited for every promise. The MCP tool would then never write a `tool_result`, taking down the client session.

Each vote promise is now raced against an overall consensus deadline (per-vote budget × retries + stagger headroom + 60s buffer). Any role that has not resolved when the deadline fires returns an error vote (`overall consensus deadline exceeded`), so partial results always come back within bounded wall-clock time.
