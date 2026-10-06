---
'nexus-agents': patch
---

Preserve unreadable outcome records during purge and reclassification rewrites so 9.x readers cannot delete outcomes written by newer versions (#7146). Unreadable lines, including malformed JSON, are appended verbatim in their original relative order after readable records. Rewrites use an atomic temporary-file rename, and each load warns with the skipped count without logging line contents.
