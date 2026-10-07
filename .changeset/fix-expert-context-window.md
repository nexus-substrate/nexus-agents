---
'nexus-agents': patch
---

Fix false context-utilization warnings from `execute_expert` by using the model that actually served the request. Report utilization as unmeasured when no model is known or token usage was not reported, instead of assuming an 8,192-token window or presenting missing usage as zero.
