---
'nexus-agents': patch
---

The governance stamp is now a digest of its sources' content instead of a commit
date (#5943, ratified 6-1). A squash-merge rewrites the committer date, so a PR
stamped one day and merged the next left main with a stamp the injector would no
longer compute — and the NEXT unrelated PR failed the idempotency check. The
stamp reads no git history at all now. Also removes the CLAUDE.md
governance-staleness warning from `release validate`, which parsed that date and
would otherwise have become a check that could never fire.
