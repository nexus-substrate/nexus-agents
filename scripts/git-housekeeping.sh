#!/usr/bin/env bash
#
# Git housekeeping — addresses #3062's recurring "too many unreachable loose
# objects" warning. Run periodically (weekly) or any time the gc.log warning
# starts firing.
#
# What it does (in order):
#
#  1. **Apply per-repo gc config** — tightens prune/reflog windows for this
#     repo only (does NOT touch user's global git config). Defaults that
#     match the churn pattern documented in #3062: 7-day prune, 30-day
#     reflog, 7-day reflog-unreachable. Idempotent — re-applying is fine.
#
#  2. **Wipe `.git/gc.log`** — the file git writes when auto-gc bails on
#     prune. While this file exists, git refuses to re-attempt auto-gc and
#     re-prints the warning on every invocation. Safe to delete; git
#     regenerates as needed.
#
#  3. **Delete branches merged into main** — long-tail accumulation is the
#     primary source of unreachable objects per the #3062 RCA. Skips main
#     and the current branch.
#
#  4. **Run `git gc --prune=now`** — actually reclaims the unreachable
#     objects the new config window now permits.
#
#  5. **Report disk savings** — du -sh .git before/after for the operator
#     to see the impact.
#
# Usage:
#
#   ./scripts/git-housekeeping.sh           # run it
#   ./scripts/git-housekeeping.sh --dry-run # show what would happen
#   ./scripts/git-housekeeping.sh --aggressive  # also pass --aggressive to gc
#
# Exit codes: 0 success; 1 not in a git repo; 2 unexpected git failure.

set -euo pipefail

DRY_RUN=0
AGGRESSIVE=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --aggressive) AGGRESSIVE=1 ;;
    -h|--help)
      sed -n '2,/^# Exit codes/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "unknown arg: $arg" >&2 ; exit 1 ;;
  esac
done

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "error: not in a git repository" >&2
  exit 1
fi

GIT_DIR="$(git rev-parse --git-dir)"
CURRENT_BRANCH="$(git symbolic-ref --short HEAD 2>/dev/null || echo '')"

run() {
  if [ "$DRY_RUN" = 1 ]; then
    echo "[dry-run] $*"
  else
    echo "[housekeeping] $*"
    eval "$@"
  fi
}

# ---------------------------------------------------------------------------
# 1. Apply per-repo gc config (#3062 Option A)
# ---------------------------------------------------------------------------
echo "==> Applying per-repo gc config..."
run "git config gc.pruneExpire '7.days.ago'"
run "git config gc.reflogExpire '30.days'"
run "git config gc.reflogExpireUnreachable '7.days'"

# ---------------------------------------------------------------------------
# 2. Wipe gc.log if present
# ---------------------------------------------------------------------------
if [ -f "$GIT_DIR/gc.log" ]; then
  echo "==> Removing stale .git/gc.log (this is what re-prints the warning)..."
  run "rm -f '$GIT_DIR/gc.log'"
else
  echo "==> No .git/gc.log present; skipping wipe."
fi

# ---------------------------------------------------------------------------
# 3. Delete merged branches (skip main + current)
# ---------------------------------------------------------------------------
echo "==> Identifying merged branches..."
# Collect branches checked out in any worktree so we never try to delete them.
# `git worktree list --porcelain` emits `branch refs/heads/<name>` lines for
# each worktree's HEAD ref.
worktree_branches=$(git worktree list --porcelain 2>/dev/null \
  | awk '/^branch refs\/heads\// {sub("refs/heads/","",$2); print $2}' \
  | sort -u)

# `git branch --merged main` prefixes ` ` for normal branches, `*` for the
# current branch, and `+` for branches checked out in another worktree.
# Strip all three markers, then filter.
merged=$(git branch --merged main 2>/dev/null \
  | sed -E 's/^[*+]? *//' \
  | awk '{$1=$1};1' \
  | grep -vE "^(main|master|${CURRENT_BRANCH})$" \
  || true)

# Remove worktree-checked-out branches — `git branch -d` would reject them
# anyway, but skipping silently keeps the output clean.
if [ -n "$worktree_branches" ]; then
  merged=$(echo "$merged" | grep -vxFf <(echo "$worktree_branches") || true)
fi

if [ -z "$merged" ]; then
  echo "    (no merged branches to delete)"
else
  count=$(echo "$merged" | wc -l | tr -d ' ')
  echo "    Found $count merged branch(es) to delete."
  if [ "$DRY_RUN" = 1 ]; then
    echo "$merged" | sed 's/^/    [dry-run] would delete: /'
  else
    echo "$merged" | xargs -n1 git branch -d 2>&1 | sed 's/^/    /'
  fi
fi

# ---------------------------------------------------------------------------
# 4. Run gc with prune
# ---------------------------------------------------------------------------
SIZE_BEFORE=$(du -sh "$GIT_DIR" | awk '{print $1}')
echo "==> .git size before: $SIZE_BEFORE"

GC_ARGS="--prune=now"
if [ "$AGGRESSIVE" = 1 ]; then
  GC_ARGS="$GC_ARGS --aggressive"
fi

echo "==> Running git gc $GC_ARGS..."
run "git gc $GC_ARGS"

# ---------------------------------------------------------------------------
# 5. Report
# ---------------------------------------------------------------------------
if [ "$DRY_RUN" != 1 ]; then
  SIZE_AFTER=$(du -sh "$GIT_DIR" | awk '{print $1}')
  echo "==> .git size after:  $SIZE_AFTER"
fi

echo "==> Housekeeping complete."
