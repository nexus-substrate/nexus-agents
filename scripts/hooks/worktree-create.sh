#!/usr/bin/env bash
#
# WorktreeCreate hook for Claude Code Agent `isolation: "worktree"` (#3060).
#
# Reads the hook payload on stdin, mints an isolated git worktree for the
# agent, and prints the worktree's ABSOLUTE PATH on stdout (exit 0). Any
# nonzero exit or empty stdout aborts the agent.
#
# Wire it in ~/.claude/settings.json — see
# docs/guides/PARALLEL_AGENT_WORKTREES.md for the contract + wiring.
#
# Deps: bash, git, jq.
set -euo pipefail

ROOT="${CLAUDE_WORKTREE_ROOT:-/tmp/claude-worktrees}"
LOG="${CLAUDE_WORKTREE_LOG:-$ROOT/hook.log}"
MAX_AGE_MIN="${CLAUDE_WORKTREE_MAX_AGE_MIN:-360}" # opportunistic prune > 6h
mkdir -p "$ROOT"

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" >>"$LOG" 2>/dev/null || true; }

payload="$(cat)"
log "WorktreeCreate stdin: $payload"

jqget() { printf '%s' "$payload" | jq -r "$1 // empty" 2>/dev/null || true; }
cwd="$(jqget '.cwd')"
session="$(jqget '.session_id')"
name="$(jqget '.name')"
[ -n "$cwd" ] || cwd="$PWD"
[ -n "$session" ] || session="nosession"
[ -n "$name" ] || name="agent"

# 1. Resolve the repo root: walk up from cwd for a .git, then fall back to
#    git's own discovery. Do NOT trust the harness's repo detection.
repo="$cwd"
while [ "$repo" != "/" ] && [ ! -e "$repo/.git" ]; do repo="$(dirname "$repo")"; done
if [ ! -e "$repo/.git" ]; then
  repo="$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null || echo '')"
fi
if [ -z "$repo" ] || [ ! -e "$repo/.git" ]; then
  log "ERROR: no git repo resolved from cwd=$cwd"
  echo "not a git repository" >&2
  exit 1
fi

# 5. Opportunistic cleanup BEFORE creating ours: prune temp worktrees older
#    than MAX_AGE_MIN (WorktreeRemove only fires at session exit, so crashed
#    sessions leak worktrees).
while IFS= read -r old; do
  [ -n "$old" ] || continue
  # SAFETY: only ever delete actual git worktrees (a linked worktree has a
  # `.git` *file*, not a dir). This bounds the destructive sweep even if
  # CLAUDE_WORKTREE_ROOT is misconfigured to a populated/shared directory.
  [ -f "$old/.git" ] || { log "skip non-worktree dir in root: $old"; continue; }
  git -C "$repo" worktree remove --force "$old" 2>/dev/null || rm -rf "$old" 2>/dev/null || true
  log "pruned stale worktree: $old"
done < <(find "$ROOT" -maxdepth 1 -mindepth 1 -type d -mmin "+$MAX_AGE_MIN" 2>/dev/null || true)
git -C "$repo" worktree prune 2>/dev/null || true

# 2. Mint a path namespaced by BOTH session and agent so concurrent agents
#    (and the same agent across sessions) never collide.
sess8="$(printf '%s' "$session" | cut -c1-8)"
name12="$(printf '%s' "$name" | tr -c 'A-Za-z0-9_.-' '-' | tail -c 12)"
wt="$ROOT/${sess8}-${name12}"

# 3. Resolve the base ref (branch name, else detached HEAD SHA).
base="$(git -C "$repo" symbolic-ref --short HEAD 2>/dev/null || git -C "$repo" rev-parse HEAD 2>/dev/null || echo '')"
if [ -z "$base" ]; then
  log "ERROR: could not resolve base ref in $repo"
  echo "no base ref" >&2
  exit 1
fi

# 4. Create the worktree detached (so the agent can make its own branch; git
#    refuses to check out a branch already checked out elsewhere). Reuse if
#    the path already exists (idempotent on retry).
if [ -d "$wt" ]; then
  log "reusing existing worktree: $wt"
elif git -C "$repo" worktree add --detach "$wt" "$base" >>"$LOG" 2>&1; then
  log "created worktree: $wt @ $base"
else
  log "ERROR: worktree add failed for $wt @ $base"
  echo "worktree add failed" >&2
  exit 1
fi

# Output contract: absolute path on stdout, exit 0.
echo "$wt"
