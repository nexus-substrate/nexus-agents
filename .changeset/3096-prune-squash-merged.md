---
'nexus-agents': patch
---

**chore(tooling):** `git:cleanup` can now prune squash-merged branches (#3096).

`git branch --merged` can't detect squash-merged branches — a squash merge creates a new commit on main, so the branch's own commits are never ancestors of main and the branch is never seen as merged. With the repo squash-merging every PR, ~64 stale local branches had accumulated that `git:cleanup` reported as "no merged branches."

New opt-in `--include-squash-merged` mode (npm: `git:cleanup:branches` / `git:cleanup:branches:dry`) asks GitHub for each branch's PR state via `gh`. A branch is force-deleted **only** when it has a MERGED PR, **no** open PR, and its local tip exactly equals the merged PR's head SHA — so no unpushed or extra local commits are ever lost. Dry-run supported; degrades gracefully when `gh` is absent.
