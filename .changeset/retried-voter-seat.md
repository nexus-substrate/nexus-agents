---
'nexus-agents': patch
---

vote record: make a retried voter seat visible instead of indistinguishable from a clean one

`voter-retry.ts` has set `retried: true` on every seat the per-role retry recovers since it was written, and `vote-types.ts` states the reason: the flag is "what makes the recovery visible instead of indistinguishable from a clean first attempt". It had one producer and **zero** consumers — both summarizers and the persisted record dropped it — so a panel that needed a retry to reach quorum recorded identically to one that answered cleanly.

That matters for a ratification vote on a governor-path change: "7 of 7 answered" and "6 answered, 1 recovered on retry" are different facts about the scrutiny the change received, and the record stated the first for both. A retried seat is weaker evidence — the model was unavailable or timed out, and the recovery ran under different conditions.

The flag now reaches the MCP response and the persisted record, is covered by the canonical hash (so editing a retried seat to a clean one moves the hash), and is admitted by the strict `VoterSummarySchema`. Records carrying it report schema `1.7`. Present only when true, so a clean panel's record and response are byte-identical to before and every historical record still verifies.
