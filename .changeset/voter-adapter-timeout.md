---
'nexus-agents': patch
---

fix(consensus): thread the vote budget into the voter's adapter call (#3304)

Adds an optional `timeoutMs` to `CompletionRequest`; `CliToModelAdapter.complete`
now uses `request.timeoutMs ?? defaultTimeoutMs`, and the voter passes its
per-vote budget (300s). Previously the adapter fell back to its shorter standard
CLI timeout (120-180s), which fired first on slow voters (e.g. the Security role
on complex proposals) and surfaced as an `MCP -32001` — dropping that voter.
Now the slow voter completes within the vote budget and its input is counted.
