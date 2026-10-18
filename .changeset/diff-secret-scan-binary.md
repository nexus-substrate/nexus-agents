---
'nexus-agents': patch
---

Pass `-a` to `git diff --cached` during CodePR diff realization so binary-classified files are scanned for secrets, and track `isBinary` in `parseNumstat`.
