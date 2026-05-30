#!/usr/bin/env bash
#
# WorktreeRemove hook for Claude Code Agent `isolation: "worktree"` (#3060).
#
# IMPORTANT: this fires on SESSION exit, NOT per-agent. A session that spawned
# N agents fires this once. So remove by session prefix and keep the same
# opportunistic age sweep the create hook does.
#
# Wire it in ~/.claude/settings.json — see
# docs/guides/PARALLEL_AGENT_WORKTREES.md.
#
# Deps: bash, git, jq.
set -euo pipefail

ROOT="${CLAUDE_WORKTREE_ROOT:-/tmp/claude-worktrees}"
LOG="${CLAUDE_WORKTREE_LOG:-$ROOT/hook.log}"
MAX_AGE_MIN="${CLAUDE_WORKTREE_MAX_AGE_MIN:-360}"
mkdir -p "$ROOT"

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" >>"$LOG" 2>/dev/null || true; }

payload="$(cat)"
log "WorktreeRemove stdin: $payload"

jqget() { printf '%s' "$payload" | jq -r "$1 // empty" 2>/dev/null || true; }
cwd="$(jqget '.cwd')"
session="$(jqget '.session_id')"
[ -n "$cwd" ] || cwd="$PWD"

repo="$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null || echo '')"

remove_one() {
  local wt="$1"
  [ -d "$wt" ] || return 0
  if [ -n "$repo" ]; then
    git -C "$repo" worktree remove --force "$wt" 2>/dev/null || rm -rf "$wt" 2>/dev/null || true
  else
    rm -rf "$wt" 2>/dev/null || true
  fi
  log "removed worktree: $wt"
}

# Remove this session's worktrees (prefix match on the 8-char session id).
sess8="$(printf '%s' "$session" | cut -c1-8)"
if [ -n "$sess8" ]; then
  for wt in "$ROOT/${sess8}-"*; do
    [ -e "$wt" ] && remove_one "$wt"
  done
fi

# Opportunistic age sweep (crashed sessions leak worktrees). SAFETY: only
# touch actual git worktrees (`.git` *file*), so a misconfigured
# CLAUDE_WORKTREE_ROOT pointing at a populated dir can't cause data loss.
while IFS= read -r old; do
  [ -n "$old" ] && [ -f "$old/.git" ] && remove_one "$old"
done < <(find "$ROOT" -maxdepth 1 -mindepth 1 -type d -mmin "+$MAX_AGE_MIN" 2>/dev/null || true)

[ -n "$repo" ] && git -C "$repo" worktree prune 2>/dev/null || true
exit 0
