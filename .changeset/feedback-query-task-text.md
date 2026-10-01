---
'nexus-agents': minor
---

Add optional task text to feedback routing records so preference learning uses the routed task rather than the router's explanation. Call `recordRoutingDecision(decision, traceId, { query: taskText })` to supply it; preference training is skipped when task text is unavailable or blank. Feedback now retains the selected preference tier and uses consistent model display names across feedback, observer, and stored decisions.
