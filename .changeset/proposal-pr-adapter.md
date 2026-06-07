---
'nexus-agents': patch
---

feat(capability-loop): Option B proposal-PR implement adapter (#3669)

The v1 `AutoRemediationDeps.implement` (per the #3648 vote, B→soak→A): commits the
consensus-approved typed plan as a reviewable `remediation-plans/<slug>.md` doc on
an `auto-remediation/<slug>` branch and opens a DRAFT PR — never auto-merged, no
autonomous code edits. Safety: the doc is **secret-scanned before any push**
(#3669 fail-closed), all writes happen in an **isolated git worktree** removed in
`finally`, and it asserts the IMPLEMENT-phase repo-write capability (fail-closed
out of phase). Orchestration is injectable + unit-tested; real git/gh impls
(`makeGitWorktreeOps`, `makeGhPrCreator`) ship for the enforce path (owner-gated).
