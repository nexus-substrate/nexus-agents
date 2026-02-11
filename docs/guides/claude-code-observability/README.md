# Claude Code Observability for nexus-agents

This guide shows how to get real-time visibility into nexus-agents MCP tool activity
when running via Claude Code.

## Overview

nexus-agents provides three layers of observability for Claude Code users:

| Layer           | Mechanism                          | What You See                                      |
| --------------- | ---------------------------------- | ------------------------------------------------- |
| **MCP Logging** | `notifications/message` (built-in) | Structured events in Claude Code's verbose output |
| **Hooks**       | Claude Code hooks config           | Tool invocation logging to a state file           |
| **Status Line** | Claude Code status line            | Persistent bottom bar showing active tools/models |

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

The hook script logs tool invocations to `/tmp/nexus-agents-session.json`, which the
status line script reads.

### What Gets Logged

Each tool invocation records:

- Tool name (e.g., `orchestrate`, `consensus_vote`)
- Timestamp
- Duration (for PostToolUse events)
- Cumulative session statistics (total calls, calls per tool)

## Layer 3: Status Line

The status line shows a persistent bar at the bottom of Claude Code with
nexus-agents activity.

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

```
[nexus] orchestrate | claude-opus | 3 tools | 2 experts | 1 vote
```

- **Active tool**: Currently running nexus-agents tool (or last completed)
- **Last model**: Most recent model routed by delegate_to_model
- **Tool count**: Total nexus-agents tool calls this session
- **Expert count**: Number of expert executions
- **Vote count**: Number of consensus votes

## Combining All Three

For maximum observability, use all three layers together. MCP logging provides
detailed events for debugging, hooks capture tool lifecycle data, and the status
line gives at-a-glance awareness.

## Files in This Directory

| File                  | Purpose                                          |
| --------------------- | ------------------------------------------------ |
| `nexus-hook.sh`       | Hook script for PreToolUse/PostToolUse events    |
| `nexus-statusline.sh` | Status line script showing nexus-agents activity |
| `README.md`           | This guide                                       |
