---
'nexus-agents': patch
---

Fix `run_dev_pipeline` reporting 0% plan approval when the vote crashed or never ran. The approval percentage is now omitted in those cases, while the failure reason or no-vote feedback remains available. Recorded votes that fail to reach quorum retain their measured percentage, and pipeline completion and plan status are unchanged.
