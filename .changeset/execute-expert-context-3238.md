---
'nexus-agents': minor
---

feat(mcp): wire accumulated context into execute_expert (#3238)

Extends the #2792 entry-point context wiring to `execute_expert` (previously only
routing/orchestrate/graph consumed `getContextForTask`). Gated behind
`NEXUS_CONTEXT_RETRIEVER_INJECT=1` — the same default-off rollout flag orchestrate
uses — so there is no behavior change until the bake-in flips it on. When enabled,
the expert task is prefixed with a sanitized "[Prior context]" block (beliefs,
memories, prior research, outcomes). Fail-soft on any retrieval error. The prefix
is run through `sanitizeExpertSummary` (the memory backends are writable by the
untrusted `memory_write` tool), and the access policy is derived from the
prefix-free task so accumulated context can never widen the derived operations.
