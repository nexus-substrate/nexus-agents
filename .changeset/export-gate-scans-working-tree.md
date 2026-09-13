---
'nexus-agents': patch
---

`scripts/check-new-unused-exports.ts` now scans the working tree, not just commits. It used to diff `<merge-base>...HEAD`, so a run before `git commit` examined nothing and exited 0 — a pass for the wrong reason, which is how four PRs on 2026-09-13 passed the gate locally and failed it in CI (#6139). The file set is now `git diff <merge-base>` (committed, staged and unstaged changes) plus untracked files under `packages/nexus-agents/src`; on a clean tree the two views list the same files, so CI behaviour is unchanged. Every run prints one `scanned N added, M modified source files since <ref> (working tree included)` line, and a run with nothing to scan says `no source files changed since <ref>` instead of exiting silently.
