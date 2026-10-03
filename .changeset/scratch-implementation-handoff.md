---
'nexus-agents': minor
---

Run dev-pipeline implementation, QA, quality checks, and security scans in a disposable worktree pinned to HEAD. Return a unified diff and its base commit for the operator to apply. Pipeline-owned file operations do not write the source checkout's tracked files, untracked files or `node_modules`, apart from git's worktree registration and the gitignored `.nexus-agents` data directory. Pipeline git runs with repository-local `GIT_*` variables removed and source hooks disabled. Dependency installs receive the same sanitized environment and are killed as a process tree on timeout. A worktree shares the source repository's git config, so installs run with `HUSKY=0`, and any change to that shared config during the run is reported as a warning, or logged when the run throws or times out (never reverted). Report an empty implementation as `no_changes`.

Provision dependencies inside the scratch before implementation, using the root lockfile from HEAD: `pnpm-lock.yaml` selects `pnpm install --frozen-lockfile --prefer-offline`, `package-lock.json` selects `npm ci --prefer-offline`, and `yarn.lock` selects `yarn install --frozen-lockfile --prefer-offline`. Installs never run in the source checkout. Report `changes.dependencies` with status `installed`, `none` or `failed`, plus the manager and failure reason when applicable. No root `package.json` or supported lockfile means `none`. A failed install reports the quality gate as unmeasured with the reason rather than as a code failure. Exclude scratch dependencies from the returned patch.

Attempt worktree removal on success, failure or timeout, and determine `worktreeRemoved` from whether the scratch path still exists after disposal. Preserve the diff/result with a leftover-path warning when removal fails, report prune failures as a separate warning, and preserve the original run error. Warn when uncommitted source paths were omitted, identifying the HEAD commit and path count. Edited gate scripts still execute on the host: the scratch checkout is not an OS sandbox.

When `NEXUS_TMPDIR` (by default `<repo>/.nexus-agents/tmp`) lies inside the source repository or the server's working directory, the worktree is created under the system temp directory instead, so the quality gate's isolation check can pass rather than refusing every untrusted gate.

Clean up worktrees retained after allocation failure and report shared config changes even when creation fails. Logging failures during cleanup never replace the original run error or discard the successful result and its warnings.
