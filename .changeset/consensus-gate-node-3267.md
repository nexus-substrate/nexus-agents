---
'nexus-agents': minor
---

feat(graph): in-graph consensus gate node + `runGraphWithConsensus` (#3267)

Adds a reusable in-graph consensus primitive (consensus vote, Option A): an
injected `ConsensusVoter` runs at a `createConsensusGateNode`, writes a typed
`ConsensusVerdict` to graph state, and **fails closed** (any voter or
proposal-extraction error → `rejected`, never a silent pass-through). Branch on
the verdict with `addConditionalEdge`, or use the `runGraphWithConsensus`
one-shot convenience. The dev-pipeline `vote` stage is refactored to delegate to
the same `runConsensusGate` core, so there is a single in-graph-consensus
implementation. All exported from the package root; documented in
`COMPOSITION_PATTERNS.md`.
