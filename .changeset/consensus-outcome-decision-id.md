---
'nexus-agents': minor
---

Consensus seat outcomes now carry the decision ID shared by their cost and vote records in `traceId`. The existing consensus decision token report adds optional counts for matched decisions, matched and unmatched outcome rows, and LLM-answered seats, plus outcome join coverage. The weather report includes these counts within its cost-section lookback window.

Coverage is unmeasured (`null`) when there are no consensus outcome rows or no matched decisions. It measures whether a decision has at least one outcome row, not complete panel coverage. An outcome's `success` means the seat answered (`source === 'llm'`), not that the answer was validated. Older outcome rows without `traceId` remain readable and count as unmatched.
