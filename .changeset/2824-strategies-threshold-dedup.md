---
'nexus-agents': patch
---

**refactor(consensus):** extract `evaluateThreshold` — dedup voting-strategy threshold math. Part of #2824 (audit P2).

`SimpleMajorityStrategy`, `SupermajorityStrategy` and `ProofOfLearningStrategy` each repeated the same approval-ratio math: `approvalPercentage = (approve / total) * 100` and `approved = approve / total {>|>=} threshold`. The three copies are now a single `evaluateThreshold(approveCount, votingTotal, threshold, inclusive)` helper. `inclusive` selects `>=` (supermajority) vs strict `>` (simple-majority, proof-of-learning). Behavior is unchanged — the 34 existing strategy tests pass.
