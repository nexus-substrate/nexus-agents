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

The status line shows a persistent dashboard at the bottom of Claude Code with
real-time session metrics and optional nexus-agents swarm monitoring.

Two versions are available:

| Version                  | Lines | Features                                               |
| ------------------------ | ----- | ------------------------------------------------------ |
| `nexus-statusline.sh`    | 2     | Nexus-agents focused (health, counters, weather)       |
| `nexus-statusline-v3.sh` | 1-2   | Full metrics (cache, API%, tokens, delta) + nexus line |

### Setup (v3 — recommended)

1. Copy the status line script and hook script:

```bash
cp docs/guides/claude-code-observability/nexus-statusline-v3.sh .claude/
cp docs/guides/claude-code-observability/nexus-hook.sh .claude/
chmod +x .claude/nexus-statusline-v3.sh .claude/nexus-hook.sh
```

2. Add to your Claude Code settings (`~/.claude/settings.json`):

```json
{
  "statusLine": {
    "type": "command",
    "command": ".claude/nexus-statusline-v3.sh"
  }
}
```

### What v3 Shows

**Line 1 — Session metrics (always shown):**

```
/project | main | Opus [agent] | ctx 62% | $2.15 | 25m | +220/-45 | cache 84% | api 40% | tok 124k/8k
```

| Field         | Source                           | Condition         |
| ------------- | -------------------------------- | ----------------- |
| CWD           | `workspace.current_dir`          | Always            |
| Git branch    | `git rev-parse`                  | Always            |
| Model         | `model.display_name`             | Always            |
| Agent badge   | `agent.name`                     | Only when set     |
| Context %     | `context_window.used_percentage` | Always            |
| Context OVER  | `exceeds_200k_tokens`            | When true         |
| Extended ctx+ | `context_window_size > 200k`     | When extended     |
| Cost          | `cost.total_cost_usd`            | Always            |
| Duration      | `cost.total_duration_ms`         | Always            |
| Code delta    | `lines_added / lines_removed`    | Always            |
| Cache hit %   | `cache_read / (read+create)`     | When cache active |
| API time %    | `api_duration / total_duration`  | When > 0          |
| Token counts  | `total_input / total_output`     | When > 0          |

**Line 2 — Nexus-agents swarm (conditional, requires hook):**

```
* > execute_expert  tools 18  exp 4  vote 2 (5:1)  graph 3/5  | cl:100% ge:75% cx:66%
```

- **Health indicator**: Green (healthy), yellow (CLI failures), red (last tool errored)
- **Active tool**: Currently running tool (yellow) or last completed (dim)
- **Counters**: Total tools, experts, votes (with approve:reject ratio)
- **Graph**: Step X/N when a graph workflow is running
- **Per-CLI weather**: Success rate with color coding (green ≥80%, yellow 60-79%, red <60%)

Line 2 only appears when a nexus-agents hook state file exists.

### Color Thresholds

| Metric        | Green   | Yellow   | Red   |
| ------------- | ------- | -------- | ----- |
| Context usage | < 60%   | 60-84%   | ≥ 85% |
| Cache hit %   | ≥ 80%   | 50-79%   | < 50% |
| API time %    | < 50%   | 50-79%   | ≥ 80% |
| CLI success   | ≥ 80%   | 60-79%   | < 60% |
| Health dot    | Healthy | CLI fail | Error |

### Graceful Degradation

- **No nexus state file**: Line 2 omitted entirely (single-line mode)
- **No agent**: Agent badge omitted
- **No cache data**: Cache % omitted
- **No API duration**: API % omitted
- **No tokens**: Token counts omitted
- **No CLI weather**: Weather section omitted

## Combining All Three

For maximum observability, use all three layers together. MCP logging provides
detailed events for debugging, hooks capture tool lifecycle data, and the status
line gives at-a-glance awareness of session health and the multi-agent swarm.

## Files in This Directory

| File                     | Purpose                                             |
| ------------------------ | --------------------------------------------------- |
| `nexus-hook.sh`          | Hook script for SessionStart/PreToolUse/PostToolUse |
| `nexus-statusline.sh`    | v2 status line (nexus-focused)                      |
| `nexus-statusline-v3.sh` | v3 status line (full metrics + nexus integration)   |
| `README.md`              | This guide                                          |
