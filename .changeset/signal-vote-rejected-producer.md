---
'nexus-agents': minor
---

feat(consensus): close the self-tuning loop for rejected votes (#3147)

Wires the first `signal.*` producer onto the typed pipeline bus per the #3289
narrow-merge scope: when a `consensus_vote` resolves to `rejected`, the MCP
handler emits `signal.vote_rejected` (proposalId, approvalPercentage, distinct
rejectionRules) via the new `consensus-vote-signals` emitter. The shadow
`TuneStage` is now instantiated at server init (`startTuneStage`, paired with
`shutdownTuneStage`), so the loop is closed end-to-end in shadow mode (logs the
intended `record_rejection` action, mutates nothing). The emitter lives at the
MCP layer to keep the consensus engine decoupled from the pipeline bus
(A=observability / B=messaging boundary, documented in EVENT_BUS_BOUNDARIES.md).
