---
title: Git Housekeeping
description: How to clear the "too many unreachable loose objects" warning and keep .git from accumulating cruft (#3062).
tier: 2
keywords: [git, gc, housekeeping, cleanup, maintenance]
---

# Git Housekeeping

The script at [`scripts/git-housekeeping.sh`](../../scripts/git-housekeeping.sh) clears the recurring `warning: There are too many unreachable loose objects` and keeps `.git/` from growing unbounded. Tracked under [#3062](https://github.com/nexus-substrate/nexus-agents/issues/3062).

## When to run

- Any time you see `warning: There are too many unreachable loose objects; run 'git prune' to remove them.` on git operations.
- Weekly during heavy-development periods (especially after a release cycle — TypeDoc regen + changeset deletions both produce unreachable objects).
- After bulk-deleting branches (the script also does this for you, but it's safe to re-run).

## How to run

```bash
pnpm git:cleanup        # apply config + delete merged branches + prune
pnpm git:cleanup:dry    # show what would happen without changing anything
./scripts/git-housekeeping.sh --aggressive   # also pass --aggressive to git gc
```

## What the script does

1. **Applies per-repo gc config** (does NOT touch global git config):
   - `gc.pruneExpire = 7.days.ago` (default: 2 weeks — too long for this repo's churn)
   - `gc.reflogExpire = 30.days` (default: 90)
   - `gc.reflogExpireUnreachable = 7.days` (default: 30)

2. **Wipes `.git/gc.log`** — the file git writes when auto-gc bails on prune. While this file exists, git refuses to re-attempt auto-gc and re-prints the warning on every invocation. Safe to delete; git regenerates as needed.

3. **Deletes branches merged into main** — long-tail accumulation is the primary source of unreachable objects per the [#3062 RCA](https://github.com/nexus-substrate/nexus-agents/issues/3062). Skips `main`, your current branch, and any branch checked out in a worktree (`git worktree list`).

4. **Runs `git gc --prune=now`** — reclaims unreachable objects the new config window permits.

5. **Reports disk savings** — `du -sh .git` before/after.

## Why this matters

The warning fires on every `git commit` / `git push` once `.git/gc.log` exists, which trains operators to ignore `warning:` output — bad for catching real warnings. The [#3062 RCA](https://github.com/nexus-substrate/nexus-agents/issues/3062) traces the recurrence to:

- **Heavy branch churn** — autonomous sessions create 10+ branches each.
- **Long reflog (4k+ entries)** keeps objects reachable past default prune windows.
- **TypeDoc HTML regen** on every release adds ~2-3k blobs that become unreachable on the next release.
- **`changeset:version`** deletes `.changeset/*.md` on every release — those blobs become unreachable immediately but still young (< 2 weeks).

Auto-gc bails on "lots of unreachable but all young," writes the warning, and refuses to retry. The tightened config + script breaks the cycle.

## Safety

- **Reversible:** the gc config writes to `.git/config` (per-repo, not global). Revert with `git config --unset gc.pruneExpire` etc.
- **Branch deletions use `git branch -d`** (not `-D`) — git refuses to delete a branch with unmerged commits. Only branches whose tip is already in `main` are touched.
- **Worktree branches are filtered out** — git would refuse anyway, but skipping them keeps the output clean.

## Related

- [#3062](https://github.com/nexus-substrate/nexus-agents/issues/3062) — full RCA and recommendation thread.
- [4bf99884dd](https://github.com/nexus-substrate/nexus-agents/commit/4bf99884dd) — prior incident where `git add docs/` swept in per-machine research files; the `docs/research/timeout-mismatch-v1.md` and `docs/research/nexus-agents-multi-harness-alignment-audit.md` are now gitignored to prevent recurrence.
