---
'nexus-agents': patch
---

`nexus-agents vote --option … --record <issue>` now includes the declared-option tally in the GitHub comment it posts: each declared option's count (an option nobody chose shows `0`), the winner line and the coverage line. The block is the same `Options:` block the terminal summary prints, rendered by the same function, so the two cannot disagree. Before this, the comment gave only Approve/Reject counts, so the durable record could not say which option won. Votes without `--option` post the same comment as before.
