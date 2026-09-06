---
'nexus-agents': patch
---

`sprint plan --vote` no longer records a quorum void as a rejection. Every non-zero exit from the vote command was collapsed into `rejected`, so a panel that could not reach quorum was reported as having rejected the sprint plan — a verdict on the plan that nobody delivered. The command now opts into `onNoQuorum: 'exit2'` and records `no_quorum` distinctly, which is the last of the four consumers #4135 named.
