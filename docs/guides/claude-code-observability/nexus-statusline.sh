#!/usr/bin/env bash
# nexus-agents Claude Code Status Line Script
#
# Reads from the hook state file and displays nexus-agents activity
# in Claude Code's persistent status bar.
#
# Usage in ~/.claude/settings.json:
#   "statusLine": { "type": "command", "command": ".claude/nexus-statusline.sh" }
#
# (Source: Issue #977, Epic #973 — Claude Code Observability)

set -euo pipefail

STATE_FILE="/tmp/nexus-agents-session.json"

# Read session JSON from stdin (provided by Claude Code)
cat > /dev/null

# Check if state file exists
if [ ! -f "$STATE_FILE" ]; then
  echo "[nexus] idle"
  exit 0
fi

STATE=$(cat "$STATE_FILE" 2>/dev/null || echo '{}')

# Extract fields
ACTIVE=$(echo "$STATE" | jq -r '.active_tool // empty')
LAST_TOOL=$(echo "$STATE" | jq -r '.last_tool // empty')
LAST_MODEL=$(echo "$STATE" | jq -r '.last_model // empty')
TOTAL=$(echo "$STATE" | jq -r '.total_calls // 0')
EXPERTS=$(echo "$STATE" | jq -r '.expert_calls // 0')
VOTES=$(echo "$STATE" | jq -r '.vote_calls // 0')

# ANSI colors
GREEN='\033[32m'
YELLOW='\033[33m'
CYAN='\033[36m'
DIM='\033[2m'
RESET='\033[0m'

# Build status line
if [ -n "$ACTIVE" ]; then
  # Tool is currently running
  TOOL_PART="${YELLOW}${ACTIVE}${RESET}"
elif [ -n "$LAST_TOOL" ]; then
  TOOL_PART="${DIM}${LAST_TOOL}${RESET}"
else
  TOOL_PART="${DIM}idle${RESET}"
fi

# Model part
if [ -n "$LAST_MODEL" ]; then
  MODEL_PART=" ${CYAN}${LAST_MODEL}${RESET}"
else
  MODEL_PART=""
fi

# Stats
STATS_PARTS=""
if [ "$TOTAL" -gt 0 ]; then
  STATS_PARTS="${GREEN}${TOTAL}${RESET} tools"
fi
if [ "$EXPERTS" -gt 0 ]; then
  STATS_PARTS="${STATS_PARTS:+${STATS_PARTS} | }${GREEN}${EXPERTS}${RESET} experts"
fi
if [ "$VOTES" -gt 0 ]; then
  STATS_PARTS="${STATS_PARTS:+${STATS_PARTS} | }${GREEN}${VOTES}${RESET} votes"
fi

# Output
if [ -n "$STATS_PARTS" ]; then
  echo -e "[nexus] ${TOOL_PART}${MODEL_PART} | ${STATS_PARTS}"
else
  echo -e "[nexus] ${TOOL_PART}${MODEL_PART}"
fi
