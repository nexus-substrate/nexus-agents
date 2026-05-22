---
'nexus-agents': patch
---

**fix(consensus):** guard `ConsensusEngine.vote()` against double quorum expansion. Closes #2861.

`vote()` is `async` and `await`s the expansion callback inside `tryExpandQuorum()` — and `tryExpandQuorum()` mutates `state.proposal.requiredVoters` / `expansionRounds` _after_ that await. Two `vote()` calls that both observe a complete quorum across the await gap would each start an expansion: the callback fires twice and the second expansion clobbers the first's voter list (and `expansionRounds` undercounts).

Fix: a per-proposal `expansionInFlight` flag on `ProposalState`. `vote()` sets it before `await tryExpandQuorum`, clears it in a `finally`, and a concurrent `vote()` that sees it set returns `ok` immediately (its vote is already recorded — the in-flight expansion handles the quorum decision). The flag is per-proposal, so independent proposals never block each other.

Severity note: the current production caller (`mcp/tools/consensus-vote.ts`) submits votes in a sequential `for await` loop, so the race is **latent** today — but `ConsensusEngine.vote()` is a public `async` method and any concurrent caller would hit it. This hardens the public contract.

Regression test in `incremental-quorum.test.ts` fires two `vote()` calls racing the final voter and asserts the expansion callback runs exactly once (verified to fail without the guard).
