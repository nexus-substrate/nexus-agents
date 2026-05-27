---
'nexus-agents': patch
---

**chore(scripts):** `scripts/git-housekeeping.sh` + `pnpm git:cleanup` for #3062 recurring git-gc warning.

The recurring `warning: There are too many unreachable loose objects` was firing on every `git commit` / `git push` because:

1. Auto-gc bails on prune (objects "too young") and writes `.git/gc.log`.
2. While `.git/gc.log` exists, git refuses to retry auto-gc and re-prints the warning on every subsequent invocation.
3. Heavy branch churn + TypeDoc HTML regen on every release + changeset deletions keep producing fresh unreachable objects faster than the default 2-week prune window can clear.

Ships Option C from the [#3062 RCA](https://github.com/nexus-substrate/nexus-agents/issues/3062): tighter per-repo config + script for periodic runs.

## What the script does

1. **Per-repo gc config** (does NOT touch global): `gc.pruneExpire=7.days.ago`, `gc.reflogExpire=30.days`, `gc.reflogExpireUnreachable=7.days`.
2. **Wipes `.git/gc.log`** so auto-gc retries on next invocation.
3. **Deletes merged branches** (uses `-d` not `-D`; filters worktree-checked-out branches).
4. **Runs `git gc --prune=now`**.
5. **Reports `du -sh .git/` before/after**.

## Usage

```bash
pnpm git:cleanup        # apply config + delete merged + prune
pnpm git:cleanup:dry    # show what would happen, no changes
./scripts/git-housekeeping.sh --aggressive   # also pass --aggressive to gc
```

## Validation on this repo

Initial run cleared 47 merged branches (including 40+ stale `worktree-agent-*` branches from Claude Code parallel-agent sessions) and shrank `.git/` from 92M to 84M. Repeat runs are idempotent.

## Also ships

- `.gitignore` entries for `docs/research/timeout-mismatch-v1.md` + `docs/research/nexus-agents-multi-harness-alignment-audit.md` — per-machine telemetry files first removed in commit `4bf99884dd` that keep getting swept in by `git add docs/`. Pinned by name so legitimate `docs/research/` files stay tracked.
- New canonical doc at `docs/ops/git-housekeeping.md`.

## Closes

Closes #3062.
