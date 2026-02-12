#!/usr/bin/env bash
# nexus-agents Claude Code Status Line (v3)
#
# Two-line dashboard combining Claude Code session metrics with nexus-agents
# MCP tool monitoring. Surfaces all available API data with conditional display.
#
# Line 1: model + agent + context + cost + duration + code delta + cache + API%
# Line 2: nexus-agents swarm health (when state file exists) OR compact extras
#
# Usage in ~/.claude/settings.json:
#   "statusLine": { "type": "command", "command": ".claude/nexus-statusline-v3.sh" }
#
# (Source: Issue #990 — Enhanced Status Line v3)

set -euo pipefail

# ── Read session JSON from stdin ─────────────────────────────────────
INPUT=$(cat)

# ── ANSI colors ──────────────────────────────────────────────────────
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
BLUE='\033[34m'
MAGENTA='\033[35m'
CYAN='\033[36m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

# ── Extract core session data ────────────────────────────────────────
# Single jq call for performance (avoids spawning multiple jq processes)
# Uses "_" as placeholder for empty strings (bash read collapses empty tab fields)
CORE=$(printf '%s' "$INPUT" | jq -r '[
  (.workspace.current_dir // .cwd // "_"),
  (.model.display_name // .model.id // "unknown"),
  (.cost.total_cost_usd // 0 | tostring),
  (.cost.total_duration_ms // 0 | tostring),
  (.cost.total_api_duration_ms // 0 | tostring),
  (.cost.total_lines_added // 0 | tostring),
  (.cost.total_lines_removed // 0 | tostring),
  (.context_window.used_percentage // -1 | tostring),
  (.context_window.context_window_size // 200000 | tostring),
  (.context_window.total_input_tokens // 0 | tostring),
  (.context_window.total_output_tokens // 0 | tostring),
  (.context_window.current_usage.cache_read_input_tokens // 0 | tostring),
  (.context_window.current_usage.cache_creation_input_tokens // 0 | tostring),
  (.exceeds_200k_tokens // false | tostring),
  (if .agent.name then .agent.name else "_" end),
  (.session_id // "default")
] | join("\t")' 2>/dev/null || printf '_\tunknown\t0\t0\t0\t0\t0\t-1\t200000\t0\t0\t0\t0\tfalse\t_\tdefault')

IFS=$'\t' read -r CWD MODEL COST_USD DURATION_MS API_DURATION_MS \
  LINES_ADDED LINES_REMOVED CTX_PCT CTX_SIZE \
  TOTAL_IN TOTAL_OUT CACHE_READ CACHE_CREATE \
  EXCEEDS_200K AGENT_NAME SESSION_ID <<< "$CORE"

# Replace placeholders with empty strings
[ "$CWD" = "_" ] && CWD=""
[ "$AGENT_NAME" = "_" ] && AGENT_NAME=""

# ── Git branch (fast, no-lock) ───────────────────────────────────────
GIT_BRANCH=""
if [ -n "$CWD" ]; then
  GIT_BRANCH=$(cd "$CWD" 2>/dev/null && git -c core.fileMode=false rev-parse --abbrev-ref HEAD 2>/dev/null || true)
fi

# ── Format: Context gauge ────────────────────────────────────────────
CTX_INT=${CTX_PCT%.*}
CTX_INT=${CTX_INT:-0}
if [ "$CTX_INT" -lt 0 ] 2>/dev/null; then
  CTX_DISPLAY="N/A"
  CTX_COLOR="$CYAN"
elif [ "$CTX_INT" -ge 85 ]; then
  CTX_DISPLAY="${CTX_INT}%"
  CTX_COLOR="$RED"
elif [ "$CTX_INT" -ge 60 ]; then
  CTX_DISPLAY="${CTX_INT}%"
  CTX_COLOR="$YELLOW"
else
  CTX_DISPLAY="${CTX_INT}%"
  CTX_COLOR="$GREEN"
fi

# Extended context indicator (>200k window)
CTX_LABEL="ctx"
CTX_SIZE_INT=${CTX_SIZE%.*}
if [ "${CTX_SIZE_INT:-200000}" -gt 200000 ] 2>/dev/null; then
  CTX_LABEL="ctx+"
fi

# Exceeds 200k warning — override context display
if [ "$EXCEEDS_200K" = "true" ]; then
  CTX_DISPLAY="OVER"
  CTX_COLOR="$RED"
fi

# ── Format: Cost (adaptive precision: $0.0012 vs $12.34 vs $384.89) ──
COST_INT=${COST_USD%.*}
COST_INT=${COST_INT:-0}
if [ "$COST_INT" -ge 10 ] 2>/dev/null; then
  COST_FMT=$(printf "%.2f" "$COST_USD" 2>/dev/null || printf "0.00")
elif [ "$COST_INT" -ge 1 ] 2>/dev/null; then
  COST_FMT=$(printf "%.2f" "$COST_USD" 2>/dev/null || printf "0.00")
else
  COST_FMT=$(printf "%.4f" "$COST_USD" 2>/dev/null || printf "0.0000")
fi

# ── Format: Duration (minutes, or hours if > 60m) ────────────────────
DUR_DISPLAY="0m"
if [ "${DURATION_MS:-0}" -gt 0 ] 2>/dev/null; then
  DUR_MIN=$((DURATION_MS / 60000))
  if [ "$DUR_MIN" -ge 60 ]; then
    DUR_HR=$((DUR_MIN / 60))
    DUR_REMAIN=$((DUR_MIN % 60))
    DUR_DISPLAY="${DUR_HR}h${DUR_REMAIN}m"
  else
    DUR_DISPLAY="${DUR_MIN}m"
  fi
fi

# ── Format: Code delta (+N/-M) ───────────────────────────────────────
ADDED=${LINES_ADDED:-0}
REMOVED=${LINES_REMOVED:-0}
if [ "$REMOVED" -gt 0 ] 2>/dev/null; then
  DELTA_DISPLAY="+${ADDED}/-${REMOVED}"
else
  DELTA_DISPLAY="+${ADDED}"
fi

# ── Format: Cache efficiency (only show if meaningful) ───────────────
CACHE_PART=""
CACHE_TOTAL=0
if [ "${CACHE_READ:-0}" -gt 0 ] || [ "${CACHE_CREATE:-0}" -gt 0 ]; then
  CACHE_TOTAL=$((CACHE_READ + CACHE_CREATE))
fi
if [ "$CACHE_TOTAL" -gt 0 ]; then
  CACHE_HIT=$((CACHE_READ * 100 / CACHE_TOTAL))
  if [ "$CACHE_HIT" -ge 80 ]; then
    CACHE_COLOR="$GREEN"
  elif [ "$CACHE_HIT" -ge 50 ]; then
    CACHE_COLOR="$YELLOW"
  else
    CACHE_COLOR="$RED"
  fi
  CACHE_PART=$(printf '%b' "${DIM}|${RESET} ${DIM}cache${RESET} ${CACHE_COLOR}${CACHE_HIT}%${RESET} ")
fi

# ── Format: API efficiency (only show if > 0) ────────────────────────
API_PART=""
if [ "${API_DURATION_MS:-0}" -gt 0 ] && [ "${DURATION_MS:-0}" -gt 0 ] 2>/dev/null; then
  API_PCT=$((API_DURATION_MS * 100 / DURATION_MS))
  if [ "$API_PCT" -gt 0 ]; then
    if [ "$API_PCT" -ge 80 ]; then
      API_COLOR="$RED"
    elif [ "$API_PCT" -ge 50 ]; then
      API_COLOR="$YELLOW"
    else
      API_COLOR="$GREEN"
    fi
    API_PART=$(printf '%b' "${DIM}|${RESET} ${DIM}api${RESET} ${API_COLOR}${API_PCT}%${RESET} ")
  fi
fi

# ── Format: Token totals (compact: Nk in / Nk out) ──────────────────
TOKEN_PART=""
IN_K=0
OUT_K=0
if [ "${TOTAL_IN:-0}" -gt 0 ] 2>/dev/null; then
  IN_K=$((TOTAL_IN / 1000))
fi
if [ "${TOTAL_OUT:-0}" -gt 0 ] 2>/dev/null; then
  OUT_K=$((TOTAL_OUT / 1000))
fi
if [ "$IN_K" -gt 0 ] || [ "$OUT_K" -gt 0 ]; then
  TOKEN_PART=$(printf '%b' "${DIM}|${RESET} ${DIM}tok${RESET} ${CYAN}${IN_K}k${DIM}/${RESET}${CYAN}${OUT_K}k${RESET} ")
fi

# ── Format: Agent name badge (only show when set) ────────────────────
AGENT_PART=""
if [ -n "$AGENT_NAME" ]; then
  AGENT_PART=$(printf '%b' "${DIM}[${RESET}${MAGENTA}${AGENT_NAME}${RESET}${DIM}]${RESET} ")
fi

# ── Format: Model display ────────────────────────────────────────────
MODEL_DISPLAY="$MODEL"

# ══════════════════════════════════════════════════════════════════════
# LINE 1: Core session metrics
# ══════════════════════════════════════════════════════════════════════
printf '%b' "${BLUE}${CWD}${RESET}"
printf '%b' " ${DIM}|${RESET} "
printf '%b' "${GREEN}${GIT_BRANCH:-no-git}${RESET}"
printf '%b' " ${DIM}|${RESET} "
printf '%b' "${MAGENTA}${MODEL_DISPLAY}${RESET} "
printf '%b' "${AGENT_PART}"
printf '%b' "${DIM}|${RESET} ${DIM}${CTX_LABEL}${RESET} ${CTX_COLOR}${CTX_DISPLAY}${RESET} "
printf '%b' "${DIM}|${RESET} ${YELLOW}\$${COST_FMT}${RESET} "
printf '%b' "${DIM}|${RESET} ${CYAN}${DUR_DISPLAY}${RESET} "
printf '%b' "${DIM}|${RESET} ${GREEN}${DELTA_DISPLAY}${RESET} "
printf '%b' "${CACHE_PART}"
printf '%b' "${API_PART}"
printf '%b' "${TOKEN_PART}"
printf '\n'

# ══════════════════════════════════════════════════════════════════════
# LINE 2: Nexus-agents swarm monitoring (conditional)
# ══════════════════════════════════════════════════════════════════════

# Find nexus state file
STATE_FILE="/tmp/nexus-agents-${SESSION_ID}.json"
if [ ! -f "$STATE_FILE" ]; then
  STATE_FILE="/tmp/nexus-agents-default.json"
fi

if [ -f "$STATE_FILE" ]; then
  # Read nexus state (single jq call for performance)
  # Uses "_" placeholder for potentially empty string fields
  NEXUS=$(cat "$STATE_FILE" 2>/dev/null | jq -r '[
    (.totalCalls // 0 | tostring),
    (.lastModel // "_"),
    (.lastToolError // false | tostring),
    ((.experts.active // {}) | length | tostring),
    ((.experts.completed // []) | length | tostring),
    (.toolCounts.vote // 0 | tostring),
    (.vote.approve // 0 | tostring),
    (.vote.reject // 0 | tostring),
    (.vote.agentsVoted // 0 | tostring),
    (.graph.workflow // "_"),
    (.graph.totalSteps // 0 | tostring),
    (.graph.completedNodes // 0 | tostring),
    (.cliUsage.claude.ok // 0 | tostring),
    (.cliUsage.claude.calls // 0 | tostring),
    (.cliUsage.gemini.ok // 0 | tostring),
    (.cliUsage.gemini.calls // 0 | tostring),
    (.cliUsage.codex.ok // 0 | tostring),
    (.cliUsage.codex.calls // 0 | tostring),
    (.cliUsage.claude.fail // 0 | tostring),
    (.cliUsage.gemini.fail // 0 | tostring),
    (.cliUsage.codex.fail // 0 | tostring),
    (.activity[0].tool // "_"),
    (.activity[0].status // "_")
  ] | join("\t")' 2>/dev/null || printf '')

  if [ -n "$NEXUS" ]; then
    IFS=$'\t' read -r N_TOTAL N_MODEL N_ERROR \
      N_EXPERTS_ACTIVE N_EXPERTS_DONE N_VOTES \
      N_APPROVE N_REJECT N_VOTED \
      N_GRAPH_WF N_GRAPH_STEPS N_GRAPH_NODES \
      N_CL_OK N_CL_CALLS N_GE_OK N_GE_CALLS N_CX_OK N_CX_CALLS \
      N_CL_FAIL N_GE_FAIL N_CX_FAIL \
      N_ACT_TOOL N_ACT_STATUS <<< "$NEXUS"

    # Replace placeholders with empty strings
    [ "$N_MODEL" = "_" ] && N_MODEL=""
    [ "$N_GRAPH_WF" = "_" ] && N_GRAPH_WF=""
    [ "$N_ACT_TOOL" = "_" ] && N_ACT_TOOL=""
    [ "$N_ACT_STATUS" = "_" ] && N_ACT_STATUS=""

    # Health dot
    HEALTH="${GREEN}*${RESET}"
    if [ "$N_ERROR" = "true" ]; then
      HEALTH="${RED}*${RESET}"
    elif [ "${N_CL_FAIL:-0}" -gt 0 ] || [ "${N_GE_FAIL:-0}" -gt 0 ] || [ "${N_CX_FAIL:-0}" -gt 0 ]; then
      HEALTH="${YELLOW}*${RESET}"
    fi

    # Active tool indicator
    TOOL_PART=""
    if [ "$N_ACT_STATUS" = "running" ] && [ -n "$N_ACT_TOOL" ]; then
      TOOL_PART=$(printf '%b' " ${DIM}>${RESET} ${YELLOW}${N_ACT_TOOL}${RESET}")
    elif [ -n "$N_ACT_TOOL" ]; then
      TOOL_PART=$(printf '%b' " ${DIM}>${RESET} ${DIM}${N_ACT_TOOL}${RESET}")
    fi

    # Counters (conditional)
    COUNTERS=""
    if [ "${N_TOTAL:-0}" -gt 0 ]; then
      COUNTERS=$(printf '%b' "${DIM}tools${RESET} ${GREEN}${N_TOTAL}${RESET}")
    fi
    EXPERT_COUNT=$(( ${N_EXPERTS_DONE:-0} + ${N_EXPERTS_ACTIVE:-0} ))
    if [ "$EXPERT_COUNT" -gt 0 ]; then
      COUNTERS=$(printf '%b' "${COUNTERS:+${COUNTERS}  }${DIM}exp${RESET} ${GREEN}${EXPERT_COUNT}${RESET}")
    fi
    if [ "${N_VOTES:-0}" -gt 0 ]; then
      VOTE_DETAIL=""
      if [ "${N_VOTED:-0}" -gt 0 ]; then
        VOTE_DETAIL=$(printf '%b' " ${DIM}(${N_APPROVE}:${N_REJECT})${RESET}")
      fi
      COUNTERS=$(printf '%b' "${COUNTERS:+${COUNTERS}  }${DIM}vote${RESET} ${GREEN}${N_VOTES}${RESET}${VOTE_DETAIL}")
    fi

    # Graph pipeline
    GRAPH_PART=""
    if [ -n "$N_GRAPH_WF" ] && [ "${N_GRAPH_STEPS:-0}" -gt 0 ]; then
      GRAPH_PART=$(printf '%b' "  ${DIM}graph${RESET} ${BOLD}${N_GRAPH_NODES}${RESET}${DIM}/${N_GRAPH_STEPS}${RESET}")
    fi

    # Per-CLI weather (compact mini-bars)
    cli_weather() {
      local ok="$1" calls="$2" name="$3"
      if [ "${calls:-0}" -eq 0 ] 2>/dev/null; then
        return
      fi
      local pct=$((ok * 100 / calls))
      local color="$GREEN"
      if [ "$pct" -lt 60 ]; then color="$RED"
      elif [ "$pct" -lt 80 ]; then color="$YELLOW"
      fi
      printf '%b' "${DIM}${name}${RESET}${color}${pct}%${RESET}"
    }

    CLI_TOTAL=$(( ${N_CL_CALLS:-0} + ${N_GE_CALLS:-0} + ${N_CX_CALLS:-0} ))
    WEATHER_PART=""
    if [ "$CLI_TOTAL" -gt 0 ]; then
      CL_W=$(cli_weather "${N_CL_OK:-0}" "${N_CL_CALLS:-0}" "cl:")
      GE_W=$(cli_weather "${N_GE_OK:-0}" "${N_GE_CALLS:-0}" "ge:")
      CX_W=$(cli_weather "${N_CX_OK:-0}" "${N_CX_CALLS:-0}" "cx:")
      WEATHER_PART="${CL_W:+${CL_W} }${GE_W:+${GE_W} }${CX_W}"
    fi

    # Compose line 2
    printf '%b' "${HEALTH}"
    printf '%b' "${TOOL_PART}"
    if [ -n "$COUNTERS" ]; then
      printf '%b' "  ${COUNTERS}"
    fi
    printf '%b' "${GRAPH_PART}"
    if [ -n "$WEATHER_PART" ]; then
      printf '%b' "  ${DIM}|${RESET} ${WEATHER_PART}"
    fi
    printf '\n'
  fi
fi
