#!/usr/bin/env bash
# nexus-agents Claude Code Hook Script (v2)
#
# Tracks nexus-agents MCP tool invocations in a session state file.
# Supports PreToolUse, PostToolUse, and SessionStart hooks.
#
# State schema v2: per-tool counters, expert tracking, vote progress,
# graph pipeline state, per-CLI usage, activity ring buffer.
#
# Usage in .claude/settings.json:
#   "hooks": {
#     "SessionStart": [{ "hooks": [{ "type": "command", "command": ".claude/nexus-hook.sh session" }] }],
#     "PreToolUse": [{ "matcher": "mcp__nexus-agents__.*", "hooks": [{ "type": "command", "command": ".claude/nexus-hook.sh pre" }] }],
#     "PostToolUse": [{ "matcher": "mcp__nexus-agents__.*", "hooks": [{ "type": "command", "command": ".claude/nexus-hook.sh post" }] }]
#   }
#
# Security: State file uses session ID in path (CWE-377 mitigation).
# Permissions: 0600 (owner read/write only).
#
# (Source: Issue #982, Epic #973 — Claude Code Observability)

set -euo pipefail

PHASE="${1:-post}"

# Read hook input from stdin
INPUT=$(cat)

# Extract session ID for per-session state file
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "default"' 2>/dev/null || echo "default")
STATE_FILE="/tmp/nexus-agents-${SESSION_ID}.json"
LOCK_FILE="/tmp/nexus-agents-${SESSION_ID}.lock"

# Map tool name to group
map_tool_group() {
  case "$1" in
    delegate_to_model)                     echo "delegate" ;;
    consensus_vote)                        echo "vote" ;;
    orchestrate)                           echo "orchestrate" ;;
    create_expert|execute_expert)          echo "expert" ;;
    run_workflow|execute_spec)             echo "workflow" ;;
    run_graph_workflow)                    echo "graph" ;;
    research_query|research_add|research_discover|research_analyze|research_catalog_review)
                                           echo "research" ;;
    memory_query|memory_stats)             echo "memory" ;;
    *)                                     echo "other" ;;
  esac
}

# Initialize state file for new session
init_state() {
  local TS
  TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  cat > "$STATE_FILE" << INIT
{"version":2,"sessionId":"${SESSION_ID}","startTime":"${TS}","totalCalls":0,"toolCounts":{"delegate":0,"vote":0,"orchestrate":0,"expert":0,"workflow":0,"graph":0,"research":0,"memory":0,"other":0},"lastModel":null,"lastToolError":false,"experts":{"active":{},"completed":[]},"vote":{"proposal":null,"agentsVoted":0,"agentsTotal":6,"approve":0,"reject":0,"strategy":null},"graph":{"workflow":null,"currentStep":0,"totalSteps":0,"completedNodes":0},"cliUsage":{"claude":{"calls":0,"ok":0,"fail":0},"gemini":{"calls":0,"ok":0,"fail":0},"codex":{"calls":0,"ok":0,"fail":0}},"activity":[],"lastUpdate":"${TS}"}
INIT
  chmod 0600 "$STATE_FILE"
}

# Main update logic
do_update() {
  local TS
  TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  # SessionStart: initialize fresh state
  if [ "$PHASE" = "session" ]; then
    init_state
    echo '{}'
    return
  fi

  # Ensure state file exists
  if [ ! -f "$STATE_FILE" ]; then
    init_state
  fi

  local STATE
  STATE=$(cat "$STATE_FILE" 2>/dev/null || echo '{}')

  # Check schema version, reinitialize if v1
  local VER
  VER=$(echo "$STATE" | jq -r '.version // 1' 2>/dev/null || echo "1")
  if [ "$VER" != "2" ]; then
    init_state
    STATE=$(cat "$STATE_FILE")
  fi

  # Extract tool name
  local FULL_TOOL TOOL GROUP
  FULL_TOOL=$(echo "$INPUT" | jq -r '.tool_name // "unknown"' 2>/dev/null || echo "unknown")
  TOOL="${FULL_TOOL#mcp__nexus-agents__}"
  GROUP=$(map_tool_group "$TOOL")

  if [ "$PHASE" = "pre" ]; then
    # PreToolUse: increment counter, push activity, tool-specific pre-processing
    STATE=$(echo "$STATE" | jq \
      --arg tool "$TOOL" \
      --arg group "$GROUP" \
      --arg ts "$TS" '
      .totalCalls += 1 |
      .toolCounts[$group] = ((.toolCounts[$group] // 0) + 1) |
      .lastToolError = false |
      .lastUpdate = $ts |
      .activity = ([{"tool": $tool, "status": "running", "ts": $ts}] + .activity)[:5]
    ')

    # Tool-specific PreToolUse enrichment
    case "$GROUP" in
      expert)
        if [ "$TOOL" = "create_expert" ]; then
          local ROLE
          ROLE=$(echo "$INPUT" | jq -r '.tool_input.role // "unknown"' 2>/dev/null || echo "unknown")
          STATE=$(echo "$STATE" | jq --arg r "$ROLE" '.experts.active[$r] = "started"')
        fi
        ;;
      vote)
        local PROPOSAL STRATEGY
        PROPOSAL=$(echo "$INPUT" | jq -r '.tool_input.proposal // "" | .[0:80]' 2>/dev/null || echo "")
        STRATEGY=$(echo "$INPUT" | jq -r '.tool_input.strategy // "majority"' 2>/dev/null || echo "majority")
        STATE=$(echo "$STATE" | jq \
          --arg p "$PROPOSAL" \
          --arg s "$STRATEGY" '
          .vote.proposal = $p |
          .vote.strategy = $s |
          .vote.agentsVoted = 0 |
          .vote.approve = 0 |
          .vote.reject = 0
        ')
        ;;
      graph)
        local WORKFLOW
        WORKFLOW=$(echo "$INPUT" | jq -r '.tool_input.workflow // "unknown"' 2>/dev/null || echo "unknown")
        STATE=$(echo "$STATE" | jq --arg w "$WORKFLOW" '
          .graph.workflow = $w |
          .graph.currentStep = 0 |
          .graph.totalSteps = 0 |
          .graph.completedNodes = 0
        ')
        ;;
    esac

  else
    # PostToolUse: extract results, update activity status
    local HAS_ERROR
    HAS_ERROR=$(echo "$INPUT" | jq -r 'if .tool_response then (.tool_response | test("isError.*true"; "i") // false) else false end' 2>/dev/null || echo "false")

    STATE=$(echo "$STATE" | jq \
      --arg tool "$TOOL" \
      --arg ts "$TS" \
      --argjson err "$HAS_ERROR" '
      .lastUpdate = $ts |
      .lastToolError = $err |
      (.activity[0] // {}).status = (if $err then "failed" else "done" end)
    ')

    # Tool-specific PostToolUse enrichment
    case "$GROUP" in
      delegate)
        # Extract model and CLI from response
        local RESP MODEL CLI
        RESP=$(echo "$INPUT" | jq -r '.tool_response // ""' 2>/dev/null || echo "")
        MODEL=$(echo "$RESP" | jq -r 'if type == "string" then (fromjson? // {}) else . end | .recommendation.model // empty' 2>/dev/null || true)
        CLI=$(echo "$RESP" | jq -r 'if type == "string" then (fromjson? // {}) else . end | .recommendation.cli // empty' 2>/dev/null || true)
        if [ -n "$MODEL" ]; then
          STATE=$(echo "$STATE" | jq --arg m "$MODEL" '.lastModel = $m')
        fi
        if [ -n "$CLI" ]; then
          STATE=$(echo "$STATE" | jq --arg c "$CLI" '
            .cliUsage[$c].calls = ((.cliUsage[$c].calls // 0) + 1) |
            .cliUsage[$c].ok = ((.cliUsage[$c].ok // 0) + 1)
          ')
        fi
        ;;
      expert)
        if [ "$TOOL" = "execute_expert" ]; then
          local ROLE
          ROLE=$(echo "$INPUT" | jq -r '.tool_input.expertId // "" | split("-") | .[0] // "unknown"' 2>/dev/null || echo "unknown")
          STATE=$(echo "$STATE" | jq --arg r "$ROLE" '
            .experts.active |= (del(.[$r]) // {}) |
            .experts.completed = ((.experts.completed // []) + [$r])[:10]
          ')
        fi
        ;;
      vote)
        # Extract vote results
        local RESP VOTED APPROVE REJECT
        RESP=$(echo "$INPUT" | jq -r '.tool_response // ""' 2>/dev/null || echo "")
        VOTED=$(echo "$RESP" | jq -r 'if type == "string" then (fromjson? // {}) else . end | .voteCounts | ((.approve // 0) + (.reject // 0) + (.abstain // 0))' 2>/dev/null || echo "0")
        APPROVE=$(echo "$RESP" | jq -r 'if type == "string" then (fromjson? // {}) else . end | .voteCounts.approve // 0' 2>/dev/null || echo "0")
        REJECT=$(echo "$RESP" | jq -r 'if type == "string" then (fromjson? // {}) else . end | .voteCounts.reject // 0' 2>/dev/null || echo "0")
        STATE=$(echo "$STATE" | jq \
          --argjson v "$VOTED" \
          --argjson a "$APPROVE" \
          --argjson r "$REJECT" '
          .vote.agentsVoted = $v |
          .vote.approve = $a |
          .vote.reject = $r
        ')
        ;;
      graph)
        # Extract graph execution results
        local RESP STEPS NODES
        RESP=$(echo "$INPUT" | jq -r '.tool_response // ""' 2>/dev/null || echo "")
        STEPS=$(echo "$RESP" | jq -r 'if type == "string" then (fromjson? // {}) else . end | .totalSteps // 0' 2>/dev/null || echo "0")
        NODES=$(echo "$RESP" | jq -r 'if type == "string" then (fromjson? // {}) else . end | .completedNodes // 0' 2>/dev/null || echo "0")
        STATE=$(echo "$STATE" | jq \
          --argjson s "$STEPS" \
          --argjson n "$NODES" '
          .graph.totalSteps = $s |
          .graph.completedNodes = $n
        ')
        ;;
    esac
  fi

  echo "$STATE" > "$STATE_FILE"
}

# Use flock for atomic updates (if available)
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
