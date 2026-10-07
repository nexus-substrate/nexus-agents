---
'nexus-agents': patch
---

Fix `consensus_vote` responses to report the model that actually served each seat in `votes[].modelUsed`, matching the panel summary. Fall back to the requested model only when the served model is unknown, and preserve the original assignment in `assignedModel`.
