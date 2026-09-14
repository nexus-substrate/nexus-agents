---
'nexus-agents': patch
---

Internal extraction; no behaviour change; public exports unchanged. The consensus engine's quorum predicate — `votes.size >= minVotersForQuorum`, which `consensus/result-builder.ts` inlined in each of its three result builders — now lives in `consensus/decision/quorum.ts` as `isQuorumReached`, alongside `DEFAULT_MIN_VOTERS_FOR_QUORUM` (`2`), which `ConsensusEngineConfigSchema` and `DEFAULT_CONSENSUS_CONFIG` now read instead of holding their own literal (#6180). Neither symbol was exported before, so no previous home re-exports them and the published API surface is byte-identical; the engine's `quorumReached` flag and its outcome are computed exactly as before. The point of the move is that the quorum step sits on the governed `consensus/decision/` path with the rest of the verdict computation, and the governed-verdict seam test derives its expected quorum through it rather than trusting the engine's own flag.
