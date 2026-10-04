---
'nexus-agents': patch
---

The model-manifest overlay loader no longer throws when its file disappears or cannot be read between the existence check and the read. A file removed in that window is now reported as `missing`; one that exists but cannot be read (for example a directory at the path, or a permission error) is reported with the new `unreadable` status and a warning, and its entries are skipped. Previously the error escaped `getDefaultRegistry()` during module load, crashing any caller that looked up a model. `nexus-agents registry doctor` shows the new status.
