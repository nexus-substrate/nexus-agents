---
---

Comment-only: correct the `VoteResult.conditional_go` note (#5768). It said three
branches were unreachable when there are four, and it claimed the variant was
inert "in the shape of" `no_quorum` — but `no_quorum` is reachable under an
opted-in `absolute_quorum` policy, while `conditional_go` has no producer under
any configuration. No release impact.
