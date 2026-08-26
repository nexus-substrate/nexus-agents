---
'nexus-agents': patch
---

fix(ci): stop the DocOps gate inheriting [skip-docops] from the base branch

The escape-hatch lookup used `git log origin/<base>...HEAD` — a **symmetric**
difference, which also returns commits reachable from the base branch but not
from HEAD. Six `[skip-docops]` commits are on `main` today, so any PR branch
whose merge-base predates one of them inherited the marker and skipped the
entire skill-sync gate, regardless of what the PR changed.

Demonstrated on this repo: with a HEAD whose merge-base predates the markers,
the three-dot range finds 7 occurrences and the two-dot range finds 0.

The commit that introduced the symmetric range is itself one of the six.
