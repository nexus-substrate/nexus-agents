---
title: 'Parallel-Agent Git-Worktree Isolation'
description: Run multiple Claude Code general-purpose Agent invocations in parallel against one checkout without git/build/test contention, using isolation "worktree" plus custom WorktreeCreate/WorktreeRemove hooks.
tier: 2
keywords:
  [
    parallel-agents,
    worktree,
    git-worktree,
    isolation,
    WorktreeCreate,
    WorktreeRemove,
    hooks,
    claude-code,
    contention,
    subagent-coordination,
  ]
---

# Parallel-Agent Git-Worktree Isolation

How to safely run multiple Claude Code `general-purpose` Agent invocations in parallel against a single git checkout. The mechanism is the Agent tool's `isolation: "worktree"` parameter backed by custom `WorktreeCreate` / `WorktreeRemove` hooks. This guide documents the empirical hook contract — which is not documented elsewhere — and the build/test gotchas that surface once agents stop sharing one working directory.

## When to use this

Use worktree isolation when **two or more agents will run concurrently and any of them touches git state, `node_modules`, `dist/`, or a test server**. Concretely:

- A wave of `general-purpose` agents each implementing a different child issue.
- One agent building/testing while another edits unrelated files.
- Any fan-out where agents independently run `git checkout`/`switch`, `npm ci`, `pnpm build`, or Playwright.

Skip it when agents are strictly read-only (use `Explore`), or when you serialize the work so only one agent mutates the tree at a time. Isolation has a cost: each worktree is a full checkout, and cross-worktree coordination (who merges, in what order) becomes your problem instead of git's.

## The contention problem

Without worktrees, parallel agents share one `cwd` and one `.git`. They collide on every stateful operation. From a real multi-day session (issue #3060), this was the single highest coordination cost — lost work was recovered from `reflog` twice before isolation was adopted.

| Shared operation                   | Failure mode when run concurrently                                                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `git checkout` / `git switch`      | One agent's branch switch overwrites another agent's _uncommitted_ working-tree edits. Silent data loss; only `reflog` recovers it. |
| `git stash`                        | Stashes pile up across agents; pop order is ambiguous and an agent pops another's stash.                                            |
| `npm ci` / `npm install`           | Concurrent writes to `node_modules/` interleave and corrupt the tree; later commands fail with missing/half-written modules.        |
| Playwright (`reuseExistingServer`) | A second agent silently reuses the _first_ agent's preview server and tests the wrong bundle. Green run, wrong code.                |
| `pnpm build` / `dist/` output      | Concurrent builds interleave file writes in `dist/`; the resulting bundle is a mix of two agents' source.                           |

The common thread: these operations assume a single writer. Parallel agents violate that assumption, and the failures are mostly _silent_ — the wrong thing succeeds rather than erroring.

## The fix: `isolation: "worktree"`

The Agent tool accepts an `isolation` parameter. Setting it to `"worktree"` gives each agent its own `git worktree` — a separate working directory backed by the same object store, with its own branch, index, and untracked files. Two agents in two worktrees cannot clobber each other's working tree, and each can build, install, and switch branches independently.

```text
Agent(subagent_type="general-purpose", isolation="worktree", prompt="implement #3061")
Agent(subagent_type="general-purpose", isolation="worktree", prompt="implement #3062")
```

### Why you need custom hooks

`isolation: "worktree"` fails out of the box with:

```text
Cannot create agent worktree: not in a git repository and no WorktreeCreate hooks are configured
```

This error fires **even when `cwd` is a git repository.** The harness's built-in repo detection checks a parent path that does not match a per-repo or nested checkout, so it concludes "not a git repo" and refuses. Configuring custom `WorktreeCreate` / `WorktreeRemove` hooks in `~/.claude/settings.json` bypasses that detection entirely: when the hooks exist, the harness delegates worktree lifecycle to them and skips its own check.

### The empirical hook contract

This is the load-bearing part of the guide, because it is not documented upstream. The contract below was established by logging every hook invocation and inspecting stdin.

**On `WorktreeCreate`, Claude Code passes this JSON on stdin:**

```json
{
  "session_id": "abc123...",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/home/you/git/your-repo",
  "hook_event_name": "WorktreeCreate",
  "name": "general-purpose-<agent-identifier>"
}
```

It does **not** pass `worktree_path`, `base_branch`, or `worktree_name`. This is the common misconception — hooks that read those fields get `undefined` and silently misbehave. **The hook must mint the path and resolve the base branch itself.**

**The hook returns the worktree's absolute path on stdout and exits 0.** That path is what the agent runs in. Any nonzero exit, or empty stdout, aborts the agent.

**`WorktreeRemove` fires on _session exit_, not per-agent.** There is no per-agent teardown signal. A single session that spawned ten agents fires `WorktreeRemove` once, at the end. This is why cleanup has to be opportunistic (see below) rather than relying on a remove event per worktree.

### What the `WorktreeCreate` hook must do

1. **Resolve the repo.** Walk up from `cwd` looking for `.git` (file or directory). That directory is the repo root to add a worktree to — do not trust the harness's notion of the repo.
2. **Mint a unique path** namespaced by _both_ session and agent, so two agents in the same session and the same agent across sessions never collide:
   `/tmp/claude-worktrees/<session_id[:8]>-<agent_name last 12 chars>/`
3. **Resolve the base branch** with `git symbolic-ref --short HEAD`, falling back to the raw `HEAD` SHA if detached.
4. **Create the worktree detached:** `git worktree add --detach <path> <base>`. Detached so the agent is free to create its own branch without colliding with the checked-out branch (git refuses to check out a branch already checked out in another worktree).
5. **Opportunistic cleanup** — prune temp worktrees older than ~6h. Because `WorktreeRemove` only fires at session exit, stale worktrees from crashed or killed sessions accumulate; clean them on the way in. The sweep is scoped to the worktree root only, so it never touches your repo's real worktrees.
6. **Log every invocation** (stdin payload + minted path + exit). The contract is undocumented; logging is how you confirm it has not changed under you.

### What the `WorktreeRemove` hook must do

Remove the worktree(s) for the exiting session: `git worktree remove --force <path>` then prune. Because it fires once per session rather than per agent, removing by session prefix (`<session_id[:8]>-*`) is the reliable approach. Keep the same opportunistic age-based sweep here too.

## Hook scripts

Reference implementations live in this repo (deps: `bash`, `git`, `jq`):

- [`scripts/hooks/worktree-create.sh`](../../scripts/hooks/worktree-create.sh)
- [`scripts/hooks/worktree-remove.sh`](../../scripts/hooks/worktree-remove.sh)

They implement the contract above and are dry-run verified: the create hook mints a detached worktree under `/tmp/claude-worktrees/<session>-<agent>/` whose object store points back to the main `.git` (so no disk bloat), prints the absolute path on stdout, and is idempotent on retry; the remove hook tears down by session prefix plus the age sweep. Tunables via env: `CLAUDE_WORKTREE_ROOT`, `CLAUDE_WORKTREE_LOG`, `CLAUDE_WORKTREE_MAX_AGE_MIN`.

> **Safety:** point `CLAUDE_WORKTREE_ROOT` at a _dedicated_ directory (the default `/tmp/claude-worktrees` is one). The opportunistic age sweep deletes stale entries under that root — but only ones that are actually git worktrees (it checks for a `.git` file), so a misconfigured root pointing at a shared/populated directory still won't delete unrelated data.

Wire them in `~/.claude/settings.json` (use **absolute** paths — hooks do not resolve repo-relative):

```json
{
  "hooks": {
    "WorktreeCreate": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/abs/path/to/nexus-agents/scripts/hooks/worktree-create.sh"
          }
        ]
      }
    ],
    "WorktreeRemove": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/abs/path/to/nexus-agents/scripts/hooks/worktree-remove.sh"
          }
        ]
      }
    ]
  }
}
```

The exact `settings.json` hook envelope is defined by your Claude Code version — confirm against its hooks documentation if the event name or shape differs. The invariant is the command's I/O: read the JSON payload on stdin, print the worktree's absolute path on stdout, exit 0. After wiring, `Agent(..., isolation: "worktree")` succeeds and each agent runs in its own worktree. Verify quickly:

```bash
echo '{"session_id":"t","cwd":"'"$PWD"'","hook_event_name":"WorktreeCreate","name":"probe"}' \
  | scripts/hooks/worktree-create.sh   # prints a /tmp/claude-worktrees/... path
```

## Gotchas

These surface specifically because each agent now has its own checkout. They do not appear in the single-cwd setup.

### Playwright `reuseExistingServer` reuses the wrong server

```ts
reuseExistingServer: !process.env.CI;
```

This is dangerous in a multi-worktree setup. Each worktree starts its preview server on the same default port, sees a server already listening (the first worktree's), and **reuses it** — so the agent tests the first worktree's bundle, not its own. Green run, wrong code.

_Fix:_ assign a unique port per worktree (derive it from the worktree path or a counter) and do not reuse across worktrees. If you must keep `reuseExistingServer`, gate it on a per-worktree port so "existing" means "this worktree's own server".

### `NODE_ENV=development` inflates local bundle-size numbers

A worktree that builds with `NODE_ENV=development` skips minification. Bundle-size figures measured locally will be much larger than CI's, which builds with `NODE_ENV=production`. Do not compare local dev bundle sizes against CI thresholds — build production-mode locally before trusting the number.

### Inherited test artifacts confuse the linter

`git worktree add` produces a clean tracked tree, but agents generate `playwright-report/` and `test-results/` during runs, and these can be picked up by ESLint in a fresh worktree and produce spurious lint errors.

_Fix:_ `rm -rf playwright-report test-results` before linting in each worktree.

## Relevance to nexus-agents

nexus-agents orchestrates multi-agent work by design — waves of `general-purpose` agents, consensus voting across 7 voter roles, cross-CLI delegation (`.rules/subagent-coordination.md`). Every one of those flows can put multiple agents against one checkout, which means it inherits exactly the contention failures in the table above: branch-switch clobbering, `node_modules` corruption, wrong-bundle test passes.

Worktree isolation is the structural fix, and the hook contract documented here is what makes `isolation: "worktree"` usable. Two open improvements remain:

- **Per-agent cleanup.** `WorktreeRemove` firing only at session exit means a long autonomous run accumulates worktrees for its whole lifetime. A per-agent teardown signal (or a tighter opportunistic age threshold) would bound disk use.
- **Random preview ports.** The Playwright `reuseExistingServer` hazard is best removed by allocating a random free port per worktree rather than relying on a derived-port convention that can still collide.

Both are tracked as follow-up work in #3060; neither blocks using the hooks today.

## See also

- [CONTEXT_LOAD_BALANCING.md](../architecture/CONTEXT_LOAD_BALANCING.md) — cross-CLI agent routing.
- `.rules/subagent-coordination.md` — wave execution, scope bounding, output budgets.
