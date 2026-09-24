---
'nexus-agents': patch
---

The `cancel_job` MCP tool description now says what a cancel does: it marks the job cancelled and aborts in-flight voter calls and orchestrate worker dispatch, and a cancelled `consensus_vote` records the votes already cast without a decision. It also notes that not every dev-pipeline stage forwards the cancel yet. The previous text said only that the job was marked cancelled.
