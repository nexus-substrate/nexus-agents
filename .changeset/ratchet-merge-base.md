---
'nexus-agents': patch
---

The Producer/Consumer export ratchet resolves the merge-base once and reads a modified file's base content from it, so an export main deleted after the branch point is no longer blamed on the PR (#5671).
