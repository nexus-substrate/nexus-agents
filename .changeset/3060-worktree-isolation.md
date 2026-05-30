---
'nexus-agents': patch
---

**docs(guides):** parallel-agent git-worktree isolation guide + reference hooks (#3060).

Adds `docs/guides/PARALLEL_AGENT_WORKTREES.md` documenting how to run multiple Claude Code `general-purpose` agents in parallel against one checkout without git/build/test contention, via `isolation: "worktree"` + custom `WorktreeCreate`/`WorktreeRemove` hooks. Captures the **empirical hook stdin contract** (which is undocumented upstream: the hook receives `session_id`/`cwd`/`name` and must mint the worktree path + base branch itself — it does NOT receive `worktree_path`/`base_branch`/`worktree_name`) and the multi-worktree gotchas (Playwright `reuseExistingServer`, `NODE_ENV` bundle-size skew, inherited test artifacts).

Ships dry-run-verified reference hooks `scripts/hooks/worktree-create.sh` + `worktree-remove.sh` (bash/git/jq; detached worktrees under `/tmp/claude-worktrees/<session>-<agent>/`, session-prefix teardown, opportunistic age sweep scoped to the worktree root). Indexed in `docs/README.md`. #3060's per-agent-cleanup + random-preview-port suggestions remain tracked there.
