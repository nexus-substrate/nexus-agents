#!/usr/bin/env bash
# nexus-agents Claude Code Hook Script
#
# Logs nexus-agents MCP tool invocations to a state file for
# the status line script to read.
#
# Usage in .claude/settings.json:
#   "hooks": {
#     "PreToolUse": [{ "matcher": "mcp__nexus-agents__.*", "hooks": [{ "type": "command", "command": ".claude/nexus-hook.sh pre" }] }],
#     "PostToolUse": [{ "matcher": "mcp__nexus-agents__.*", "hooks": [{ "type": "command", "command": ".claude/nexus-hook.sh post" }] }]
#   }
#
# (Source: Issue #977, Epic #973 — Claude Code Observability)

set -euo pipefail

PHASE="${1:-post}"
STATE_FILE="/tmp/nexus-agents-session.json"
LOCK_FILE="/tmp/nexus-agents-session.lock"

# Read hook input from stdin
INPUT=$(cat)

# Extract tool name (strip mcp__nexus-agents__ prefix)
FULL_TOOL=$(echo "$INPUT" | jq -r '.tool_name // "unknown"')
TOOL="${FULL_TOOL#mcp__nexus-agents__}"
TIMESTAMP=$(date +%s)

# Ensure state file exists with defaults
if [ ! -f "$STATE_FILE" ]; then
  cat > "$STATE_FILE" << 'INIT'
{"active_tool":null,"last_tool":null,"last_model":null,"total_calls":0,"expert_calls":0,"vote_calls":0,"workflow_calls":0,"delegate_calls":0,"orchestrate_calls":0,"last_updated":0}
INIT
fi

# Use flock for atomic updates (if available)
do_update() {
  local STATE
  STATE=$(cat "$STATE_FILE" 2>/dev/null || echo '{}')

  if [ "$PHASE" = "pre" ]; then
    # Mark tool as active
    STATE=$(echo "$STATE" | jq --arg tool "$TOOL" --argjson ts "$TIMESTAMP" '
      .active_tool = $tool |
      .last_updated = $ts
    ')
  else
    # Post: update counters and clear active
    local TOTAL
    TOTAL=$(echo "$STATE" | jq -r '.total_calls // 0')
    TOTAL=$((TOTAL + 1))

    STATE=$(echo "$STATE" | jq \
      --arg tool "$TOOL" \
      --argjson ts "$TIMESTAMP" \
      --argjson total "$TOTAL" '
      .active_tool = null |
      .last_tool = $tool |
      .total_calls = $total |
      .last_updated = $ts
    ')

    # Increment tool-specific counters
    case "$TOOL" in
      execute_expert)
        STATE=$(echo "$STATE" | jq '.expert_calls = (.expert_calls // 0) + 1') ;;
      consensus_vote)
        STATE=$(echo "$STATE" | jq '.vote_calls = (.vote_calls // 0) + 1') ;;
      run_workflow|run_graph_workflow)
        STATE=$(echo "$STATE" | jq '.workflow_calls = (.workflow_calls // 0) + 1') ;;
      delegate_to_model)
        STATE=$(echo "$STATE" | jq '.delegate_calls = (.delegate_calls // 0) + 1')
        # Try to extract the recommended model from tool response
        local MODEL
        MODEL=$(echo "$INPUT" | jq -r '.tool_response // "" | if type == "string" then (fromjson? // {}) else . end | .recommended_model // empty' 2>/dev/null || true)
        if [ -n "$MODEL" ]; then
          STATE=$(echo "$STATE" | jq --arg m "$MODEL" '.last_model = $m')
        fi
        ;;
      orchestrate)
        STATE=$(echo "$STATE" | jq '.orchestrate_calls = (.orchestrate_calls // 0) + 1') ;;
    esac
  fi

  echo "$STATE" > "$STATE_FILE"
}

# Try flock for atomicity, fall back to direct write
if command -v flock >/dev/null 2>&1; then
  (
    flock -w 2 200 || true
    do_update
  ) 200>"$LOCK_FILE"
else
  do_update
fi

# Output empty JSON (no hook behavior changes)
echo '{}'
