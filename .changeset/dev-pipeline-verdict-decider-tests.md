---
'nexus-agents': patch
---

Pin the dev-pipeline vote-verdict decider contract with direct tests (#4174): `no_quorum` is never an approval and carries no reviewer feedback (#4135), `conditional_go` approves, rejection feedback passes through, and `createVoteResult` can never manufacture `no_quorum`. Test-only change.
