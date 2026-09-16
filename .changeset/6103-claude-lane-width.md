---
'nexus-agents': patch
---

Consensus panels admit two `cli-claude` seats at once instead of one (#6103): the first per-seat timing readout showed fallback seats waiting 244–398 s behind the serialized claude lane, and a 15-call concurrency probe produced none of the OAuth-refresh failures the #3348 serialization guards against. Other CLIs keep a lane of one; a refresh collision would surface as a retried attempt on the seat's `Seat timing` line.
