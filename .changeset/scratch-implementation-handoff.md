---
'nexus-agents': minor
---

Run dev-pipeline implementation, QA, quality checks, and security scans in a disposable worktree pinned to HEAD. Return a unified diff and its base commit for the operator to apply, leaving the source checkout unchanged. Report an empty implementation as `no_changes`.

Link existing root and workspace `node_modules` directories from tracked package locations without a network install, report `changes.dependenciesLinked` (zero when none are installed, with gate behaviour unchanged), and exclude dependency links from the returned patch. Cleanup removes links without deleting source dependencies. Attempt worktree removal on success, failure, or timeout; preserve the diff/result with `worktreeRemoved: false` and a leftover-path warning if cleanup fails, and preserve the original run error. Warn when uncommitted source paths were omitted, identifying the HEAD commit and path count.

When `NEXUS_TMPDIR` (by default `<repo>/.nexus-agents/tmp`) lies inside the source repository or the server's working directory, the worktree is created under the system temp directory instead, so the quality gate's isolation check can pass rather than refusing every untrusted gate.
