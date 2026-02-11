#!/usr/bin/env bash
# nexus-agents Claude Code Status Line Script (v2)
#
# Two-line dashboard showing real-time swarm monitoring:
#   Line 1: Health dot + model + active tool + counters + cost + context gauge
#   Line 2: Per-CLI weather bars + session trend
#
# Reads from: hook state file + Claude Code session JSON (stdin)
#
# Usage in ~/.claude/settings.json:
#   "statusLine": { "type": "command", "command": ".claude/nexus-statusline.sh" }
#
# (Source: Issue #982, Epic #973 — Claude Code Observability)

set -euo pipefail

# ANSI colors
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
CYAN='\033[36m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

# Read Claude Code session JSON from stdin
SESSION_JSON=$(cat)

# Extract session data (cost, context, model)
CTX_PCT=$(echo "$SESSION_JSON" | jq -r '.context_window.used_percentage // 0' 2>/dev/null || echo "0")
COST=$(echo "$SESSION_JSON" | jq -r '.cost.total_cost_usd // 0' 2>/dev/null || echo "0")
MODEL=$(echo "$SESSION_JSON" | jq -r '.model.display_name // .model.id // "unknown"' 2>/dev/null || echo "unknown")

# Find state file (prefer session-specific, fall back to default)
SESSION_ID=$(echo "$SESSION_JSON" | jq -r '.session_id // "default"' 2>/dev/null || echo "default")
STATE_FILE="/tmp/nexus-agents-${SESSION_ID}.json"
if [ ! -f "$STATE_FILE" ]; then
  STATE_FILE="/tmp/nexus-agents-default.json"
fi

# Load state (or empty defaults)
if [ -f "$STATE_FILE" ]; then
  STATE=$(cat "$STATE_FILE" 2>/dev/null || echo '{}')
else
  # No state file — show minimal status
  echo -e "${DIM}●${RESET} ${DIM}nexus${RESET}  ${DIM}${MODEL}${RESET}  ${DIM}\$${COST}${RESET}  ${DIM}ctx ${CTX_PCT}%${RESET}"
  exit 0
fi

# ── Extract state fields ──────────────────────────────────────────────
TOTAL=$(echo "$STATE" | jq -r '.totalCalls // 0')
LAST_MODEL=$(echo "$STATE" | jq -r '.lastModel // empty')
LAST_ERROR=$(echo "$STATE" | jq -r '.lastToolError // false')
EXPERTS_DONE=$(echo "$STATE" | jq -r '.experts.completed | length // 0' 2>/dev/null || echo "0")
EXPERTS_ACTIVE=$(echo "$STATE" | jq -r '.experts.active | length // 0' 2>/dev/null || echo "0")
VOTE_APPROVE=$(echo "$STATE" | jq -r '.vote.approve // 0')
VOTE_REJECT=$(echo "$STATE" | jq -r '.vote.reject // 0')
VOTE_TOTAL=$(echo "$STATE" | jq -r '.vote.agentsVoted // 0')
VOTES_DONE=$(echo "$STATE" | jq -r '.toolCounts.vote // 0')
GRAPH_WF=$(echo "$STATE" | jq -r '.graph.workflow // empty')
GRAPH_STEPS=$(echo "$STATE" | jq -r '.graph.totalSteps // 0')
GRAPH_NODES=$(echo "$STATE" | jq -r '.graph.completedNodes // 0')
DELEGATES=$(echo "$STATE" | jq -r '.toolCounts.delegate // 0')
CLI_CLAUDE_OK=$(echo "$STATE" | jq -r '.cliUsage.claude.ok // 0')
CLI_CLAUDE_FAIL=$(echo "$STATE" | jq -r '.cliUsage.claude.fail // 0')
CLI_CLAUDE_CALLS=$(echo "$STATE" | jq -r '.cliUsage.claude.calls // 0')
CLI_GEMINI_OK=$(echo "$STATE" | jq -r '.cliUsage.gemini.ok // 0')
CLI_GEMINI_FAIL=$(echo "$STATE" | jq -r '.cliUsage.gemini.fail // 0')
CLI_GEMINI_CALLS=$(echo "$STATE" | jq -r '.cliUsage.gemini.calls // 0')
CLI_CODEX_OK=$(echo "$STATE" | jq -r '.cliUsage.codex.ok // 0')
CLI_CODEX_FAIL=$(echo "$STATE" | jq -r '.cliUsage.codex.fail // 0')
CLI_CODEX_CALLS=$(echo "$STATE" | jq -r '.cliUsage.codex.calls // 0')
ACTIVITY_TOOL=$(echo "$STATE" | jq -r '.activity[0].tool // empty' 2>/dev/null || true)
ACTIVITY_STATUS=$(echo "$STATE" | jq -r '.activity[0].status // empty' 2>/dev/null || true)

# ── Helper: render gauge bar (10 chars) ───────────────────────────────
render_gauge() {
  local pct="$1" color="$2"
  local filled=$((pct / 10))
  local empty=$((10 - filled))
  local bar=""
  for ((i=0; i<filled; i++)); do bar+="▓"; done
  for ((i=0; i<empty; i++)); do bar+="░"; done
  echo -e "${color}${bar}${RESET}"
}

# ── Helper: CLI success rate with color ───────────────────────────────
cli_rate() {
  local ok="$1" calls="$2" name="$3"
  if [ "$calls" -eq 0 ]; then
    echo -e "${DIM}${name}:—${RESET}"
    return
  fi
  local pct=$((ok * 100 / calls))
  local color="$GREEN"
  if [ "$pct" -lt 60 ]; then color="$RED"
  elif [ "$pct" -lt 80 ]; then color="$YELLOW"
  fi
  # Mini bar (5 chars)
  local filled=$((pct / 20))
  local empty=$((5 - filled))
  local bar=""
  for ((i=0; i<filled; i++)); do bar+="█"; done
  for ((i=0; i<empty; i++)); do bar+="░"; done
  echo -e "${DIM}${name}${RESET} ${color}${bar}${RESET} ${color}${pct}%${RESET}"
}

# ── Health dot ────────────────────────────────────────────────────────
HEALTH_DOT="${GREEN}●${RESET}"
if [ "$LAST_ERROR" = "true" ]; then
  HEALTH_DOT="${RED}●${RESET}"
elif [ "$CLI_GEMINI_FAIL" -gt 0 ] || [ "$CLI_CODEX_FAIL" -gt 0 ] || [ "$CLI_CLAUDE_FAIL" -gt 0 ]; then
  HEALTH_DOT="${YELLOW}●${RESET}"
fi

# ── Active tool / last tool ───────────────────────────────────────────
TOOL_PART=""
if [ "$ACTIVITY_STATUS" = "running" ] && [ -n "$ACTIVITY_TOOL" ]; then
  TOOL_PART=" ${DIM}→${RESET} ${YELLOW}${ACTIVITY_TOOL}${RESET}"
elif [ -n "$ACTIVITY_TOOL" ]; then
  TOOL_PART=" ${DIM}→${RESET} ${DIM}${ACTIVITY_TOOL}${RESET}"
fi

# ── Display model (prefer last routed model, fall back to session model)
DISPLAY_MODEL="${LAST_MODEL:-$MODEL}"

# ── Counters ──────────────────────────────────────────────────────────
COUNTERS=""
if [ "$TOTAL" -gt 0 ]; then
  COUNTERS="${DIM}tools${RESET} ${GREEN}${TOTAL}${RESET}"
fi
EXPERT_COUNT=$((EXPERTS_DONE + EXPERTS_ACTIVE))
if [ "$EXPERT_COUNT" -gt 0 ]; then
  COUNTERS="${COUNTERS:+${COUNTERS}  }${DIM}experts${RESET} ${GREEN}${EXPERT_COUNT}${RESET}"
fi
if [ "$VOTES_DONE" -gt 0 ]; then
  VOTE_DETAIL=""
  if [ "$VOTE_TOTAL" -gt 0 ]; then
    VOTE_DETAIL=" ${DIM}(${VOTE_APPROVE}:${VOTE_REJECT})${RESET}"
  fi
  COUNTERS="${COUNTERS:+${COUNTERS}  }${DIM}votes${RESET} ${GREEN}${VOTES_DONE}${RESET}${VOTE_DETAIL}"
fi

# ── Graph pipeline ────────────────────────────────────────────────────
GRAPH_PART=""
if [ -n "$GRAPH_WF" ] && [ "$GRAPH_STEPS" -gt 0 ]; then
  GRAPH_PART="  ${DIM}graph${RESET} ${BOLD}${GRAPH_NODES}${RESET}${DIM}/${GRAPH_STEPS}${RESET}"
fi

# ── Context gauge ─────────────────────────────────────────────────────
CTX_INT=${CTX_PCT%.*}
CTX_INT=${CTX_INT:-0}
CTX_COLOR="$GREEN"
if [ "$CTX_INT" -ge 85 ]; then CTX_COLOR="$RED"
elif [ "$CTX_INT" -ge 60 ]; then CTX_COLOR="$YELLOW"
fi
CTX_GAUGE=$(render_gauge "$CTX_INT" "$CTX_COLOR")

# ── Cost (always dim) ────────────────────────────────────────────────
COST_FMT=$(printf "%.2f" "$COST" 2>/dev/null || echo "0.00")

# ══════════════════════════════════════════════════════════════════════
# LINE 1: Health + model + tool + counters + graph + cost + context
# ══════════════════════════════════════════════════════════════════════
LINE1="${HEALTH_DOT} ${BOLD}${DISPLAY_MODEL}${RESET}${TOOL_PART}"
if [ -n "$COUNTERS" ]; then
  LINE1="${LINE1}  ${COUNTERS}"
fi
LINE1="${LINE1}${GRAPH_PART}  ${DIM}\$${COST_FMT}${RESET}  ${DIM}ctx${RESET} ${CTX_GAUGE} ${CTX_COLOR}${CTX_INT}%${RESET}"

# ══════════════════════════════════════════════════════════════════════
# LINE 2: Per-CLI weather + session info
# ══════════════════════════════════════════════════════════════════════
CLI_TOTAL=$((CLI_CLAUDE_CALLS + CLI_GEMINI_CALLS + CLI_CODEX_CALLS))

if [ "$CLI_TOTAL" -gt 0 ]; then
  C_RATE=$(cli_rate "$CLI_CLAUDE_OK" "$CLI_CLAUDE_CALLS" "claude")
  G_RATE=$(cli_rate "$CLI_GEMINI_OK" "$CLI_GEMINI_CALLS" "gemini")
  X_RATE=$(cli_rate "$CLI_CODEX_OK" "$CLI_CODEX_CALLS" "codex")
  LINE2="${DIM}weather${RESET}  ${C_RATE}   ${G_RATE}   ${X_RATE}"
elif [ "$DELEGATES" -gt 0 ]; then
  LINE2="${DIM}weather${RESET}  ${DIM}collecting data...${RESET}"
else
  LINE2="${DIM}weather${RESET}  ${DIM}no routing data${RESET}"
fi

# Session uptime
START_TIME=$(echo "$STATE" | jq -r '.startTime // empty' 2>/dev/null || true)
if [ -n "$START_TIME" ]; then
  START_EPOCH=$(date -d "$START_TIME" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$START_TIME" +%s 2>/dev/null || echo "0")
  NOW_EPOCH=$(date +%s)
  if [ "$START_EPOCH" -gt 0 ]; then
    ELAPSED=$(( NOW_EPOCH - START_EPOCH ))
    MINS=$(( ELAPSED / 60 ))
    LINE2="${LINE2}  ${DIM}session ${MINS}m · ${TOTAL} calls${RESET}"
  fi
fi

# ── Output both lines ─────────────────────────────────────────────────
echo -e "$LINE1"
echo -e "$LINE2"
