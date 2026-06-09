---
'nexus-agents': patch
---

security(jobs): write async job sidecar files (`<NEXUS_DATA_DIR>/jobs/result-<jobId>.json`) with `0600` permissions (#3753, defense-in-depth). The payload may carry job-result data; restricting to the owner matters if `NEXUS_DATA_DIR` is ever shared across users. Extracted a `persistJobRecord` helper (DRY over the four writers) that sets the mode on write and `chmod`s after, so the permission holds even when a terminal status overwrites a pre-existing pending file. Not exploitable today (per-user stdio MCP, randomUUID jobIds) — pure hardening.
