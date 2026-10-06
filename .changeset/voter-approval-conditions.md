---
'nexus-agents': minor
---

Persist per-voter approval conditions as advisory, unenforced evidence in vote record schema 1.15. Preserve absent versus empty conditions, bound the array to 20 strings of 2,000 characters, and reject oversized records without truncation. Conditions are hash-covered only when present, preserving historical record hashes.
