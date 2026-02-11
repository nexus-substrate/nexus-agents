# Claude Code Observability for nexus-agents

This guide shows how to get real-time visibility into nexus-agents MCP tool activity
when running via Claude Code.

## Overview

nexus-agents provides three layers of observability for Claude Code users:

| Layer           | Mechanism                          | What You See                                      |
| --------------- | ---------------------------------- | ------------------------------------------------- |
| **MCP Logging** | `notifications/message` (built-in) | Structured events in Claude Code's verbose output |
| **Hooks**       | Claude Code hooks config           | Tool invocation logging to a state file           |
| **Status Line** | Claude Code status line            | 2-line dashboard with swarm health and weather    |

## Layer 1: MCP Logging Notifications (Built-in)

nexus-agents automatically sends structured log events via the MCP `notifications/message`
protocol. These appear in Claude Code's verbose mode (`--verbose` flag or `/verbose` command).

Events emitted by tool:

| Tool                 | Events                                            |
| -------------------- | ------------------------------------------------- |
| `delegate_to_model`  | `routing_start`, `model_selected`                 |
| `consensus_vote`     | `vote_start`, `vote_collected`, `vote_complete`   |
| `orchestrate`        | `orchestrate_start`, `orchestrate_complete`       |
| `execute_expert`     | `expert_start`, `expert_complete`                 |
| `run_workflow`       | `workflow_start`, `workflow_complete`             |
| `run_graph_workflow` | `graph_workflow_start`, `graph_workflow_complete` |

No configuration required. This works out of the box.

## Layer 2: Hooks Configuration

Claude Code hooks let you run shell commands on tool lifecycle events.
Add the following to your project's `.claude/settings.json` or `~/.claude/settings.json`.

### Setup

1. Copy the hook script to your project:

```bash
cp docs/guides/claude-code-observability/nexus-hook.sh .claude/
chmod +x .claude/nexus-hook.sh
```

2. Add the hooks configuration to `.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": ".claude/nexus-hook.sh session",
            "timeout": 5
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "mcp__nexus-agents__.*",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/nexus-hook.sh pre",
            "timeout": 5
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "mcp__nexus-agents__.*",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/nexus-hook.sh post",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

The hook script logs tool invocations to `/tmp/nexus-agents-{session_id}.json` with
`0600` permissions and `flock` for atomic updates.

### State File Schema (v2)

Each session gets its own state file tracking:

| Field        | Description                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------- |
| `toolCounts` | Per-group counters: delegate, vote, orchestrate, expert, workflow, graph, research, memory, other |
| `lastModel`  | Most recent model routed by `delegate_to_model`                                                   |
| `experts`    | Active and completed expert types                                                                 |
| `vote`       | Current/last vote: proposal, agents voted, approve/reject counts, strategy                        |
| `graph`      | Graph pipeline: workflow name, total steps, completed nodes                                       |
| `cliUsage`   | Per-CLI (claude/gemini/codex) call counts and success/failure                                     |
| `activity`   | Rolling buffer of last 5 tool invocations with status                                             |

### Tool Group Mapping

| Tools                             | Group       |
| --------------------------------- | ----------- |
| `delegate_to_model`               | delegate    |
| `consensus_vote`                  | vote        |
| `orchestrate`                     | orchestrate |
| `create_expert`, `execute_expert` | expert      |
| `run_workflow`, `execute_spec`    | workflow    |
| `run_graph_workflow`              | graph       |
| `research_*`                      | research    |
| `memory_*`                        | memory      |
| Everything else                   | other       |

## Layer 3: Status Line

The status line shows a persistent 2-line dashboard at the bottom of Claude Code
with real-time swarm monitoring.

### Setup

1. Copy the status line script:

```bash
cp docs/guides/claude-code-observability/nexus-statusline.sh .claude/
chmod +x .claude/nexus-statusline.sh
```

2. Add to your Claude Code settings (`~/.claude/settings.json`):

```json
{
  "statusLine": {
    "type": "command",
    "command": ".claude/nexus-statusline.sh"
  }
}
```

### What It Shows

**Line 1 — Primary (identity, activity, budget):**

```
● claude-opus  → orchestrate  tools 12  experts 3  votes 1 (5:0)  $1.24  ctx ▓▓▓▓▓▓░░░░ 67%
```

- **Health dot**: Green (healthy), yellow (CLI failures), red (last tool errored)
- **Model**: Last model routed by delegate_to_model (or session model)
- **Active tool**: Currently running tool (yellow) or last completed (dim)
- **Counters**: Total tools, experts, votes (with approve:reject ratio)
- **Graph**: Step X/N when a graph workflow is running
- **Cost**: Session cost from Claude Code
- **Context gauge**: 10-char bar with color thresholds (green <60%, yellow 60-84%, red ≥85%)

**Line 2 — Secondary (weather, session):**

```
weather  claude █████ 100%   gemini ████░ 80%   codex ███░░ 60%  session 14m · 38 calls
```

- **Per-CLI weather**: Success rate bars (5-char) with color coding
- **Session**: Uptime and total tool calls

### Color Thresholds

| Metric        | Green   | Yellow   | Red   |
| ------------- | ------- | -------- | ----- |
| Health dot    | Healthy | CLI fail | Error |
| CLI success   | ≥ 80%   | 60-79%   | < 60% |
| Context usage | < 60%   | 60-84%   | ≥ 85% |

### Graceful Degradation

The status line adapts to available data:

- **No state file**: Shows minimal `● nexus model $cost ctx X%`
- **No routing data**: Shows `weather  no routing data` on line 2
- **No graph running**: Graph section omitted
- **No votes/experts**: Counter sections omitted

## Combining All Three

For maximum observability, use all three layers together. MCP logging provides
detailed events for debugging, hooks capture tool lifecycle data, and the status
line gives at-a-glance awareness of the multi-agent swarm.

## Files in This Directory

| File                  | Purpose                                             |
| --------------------- | --------------------------------------------------- |
| `nexus-hook.sh`       | Hook script for SessionStart/PreToolUse/PostToolUse |
| `nexus-statusline.sh` | 2-line status line dashboard                        |
| `README.md`           | This guide                                          |
