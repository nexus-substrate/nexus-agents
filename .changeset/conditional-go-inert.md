---
'nexus-agents': patch
---

The `conditional_go` vote result is documented as having no production producer. Nothing constructs it outside tests, so `extractConditionalMeta`'s branch and the second disjunct of both `isApproved` and `isVoteAccepted` are unreachable, and a task's `conditions`/`caveats` are always absent. The note follows the shape of the `no_quorum` sibling, which records the same kind of fact; whether to wire the variant or remove it is #5768.
