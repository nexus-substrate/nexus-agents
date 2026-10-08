---
'nexus-agents': patch
---

Allow the dev pipeline's security baseline comparison to complete when both scans report the same file-local matcher error or per-file timeout on a file whose blob hash and mode match the pinned base. No security rules are excluded. Tolerated files are listed as unscanned with their reason and scanner/rule provenance in the comparison and gate output; completion does not mean full scan coverage. Changed, added, missing, unsafe, unreadable, mode-changed, or one-sided errors and global scanner/output/configuration failures keep introductions unmeasured.
