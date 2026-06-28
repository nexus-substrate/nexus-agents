---
'nexus-agents': minor
---

Make the higher-order voting strategy's correlation tracker injectable (#3173).
`OWVoting.aggregate()` previously required an `ICorrelationTracker` argument, and
the MCP consensus path always threaded its process-wide singleton through — so
higher-order voting could not be reused as a building block (autonomous agents,
test harnesses, custom pipelines) without coupling to that singleton or modifying
the call signature.

`OWVotingOptions` now accepts an optional `tracker`, and `aggregate(votes, tracker?)`
resolves the tracker as: per-call argument → constructor-injected → else throws a
clear error. Fully backward compatible — existing callers that pass the tracker
positionally are unchanged, and the MCP path keeps owning its persistent singleton.
The `IHigherOrderVoting.aggregate` signature's `tracker` is now optional to match.
