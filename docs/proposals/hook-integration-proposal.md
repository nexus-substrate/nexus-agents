# Proposal: Claude CLI Hook Integration for nexus-agents

**Issue:** #411
**Date:** 2026-01-24 (ET)
**Status:** APPROVED

---

## Voting Record

| Agent                | Vote    | Confidence | Reasoning                                             |
| -------------------- | ------- | ---------- | ----------------------------------------------------- |
| Software Architect   | APPROVE | 88%        | Leverages existing infrastructure, clean architecture |
| Security Engineer    | ABSTAIN | -          | Vote timeout                                          |
| Developer Experience | ABSTAIN | -          | Vote timeout                                          |
| AI/ML Engineer       | APPROVE | 92%        | Good integration with observability layer             |
| Product Manager      | APPROVE | 88%        | Addresses user need, reasonable scope                 |

**Result:** APPROVED (100% of participating voters, supermajority threshold)

---

## Problem Statement

Users who want hook functionality with Claude CLI must use external packages like `claude-flow@alpha` which:

- Uses unstable alpha releases (394+ versions)
- Adds latency by running `npx` on every tool use
- Creates external dependency for core functionality that nexus-agents should provide

nexus-agents already has session storage infrastructure that could power hook functionality natively.

---

## Proposed Solution

Add CLI commands to nexus-agents that integrate with Claude CLI's hook system.

### Command Structure

```bash
# Session lifecycle
nexus-agents hooks session-start [--source startup|resume|clear|compact]
nexus-agents hooks session-end [--reason clear|logout|exit] [--export-metrics]

# Tool lifecycle
nexus-agents hooks pre-tool --tool <name> [--validate] [--load-context]
nexus-agents hooks post-tool --tool <name> [--track-metrics] [--format]

# Stop control
nexus-agents hooks stop [--check-tasks] [--generate-summary]
```

### Hook Protocol Compliance

Per Claude CLI documentation, hooks receive JSON via stdin:

```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/project/dir",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": { "command": "npm test" }
}
```

Output via exit codes + optional JSON stdout:

- Exit 0: Success (stdout shown in verbose mode)
- Exit 2: Blocking error (stderr fed to Claude)
- JSON output for control decisions (allow/deny/block)

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Claude CLI                              │
│  (calls hooks via stdin/stdout)                          │
└─────────────────────┬───────────────────────────────────┘
                      │ JSON stdin
                      ▼
┌─────────────────────────────────────────────────────────┐
│              nexus-agents hooks <cmd>                    │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ HookRouter   │  │ HookHandler  │  │ HookOutput   │  │
│  │ (parse stdin)│→ │ (execute)    │→ │ (format)     │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│         │                  │                  │         │
│         ▼                  ▼                  ▼         │
│  ┌──────────────────────────────────────────────────┐  │
│  │           Existing Infrastructure                 │  │
│  │  SQLiteSessionStorage │ OrchestrationObserver    │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### File Structure

```
packages/nexus-agents/src/cli/
├── hooks/
│   ├── index.ts              # Hook command router
│   ├── hook-types.ts         # Zod schemas for hook I/O
│   ├── hook-router.ts        # Parse stdin, route to handlers
│   ├── hook-output.ts        # Format exit codes and JSON
│   ├── handlers/
│   │   ├── session-start.ts
│   │   ├── session-end.ts
│   │   ├── pre-tool.ts
│   │   ├── post-tool.ts
│   │   └── stop.ts
│   └── hooks.test.ts
```

### Example Integration

User's `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "nexus-agents hooks session-start"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "nexus-agents hooks pre-tool --tool Bash --validate"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "nexus-agents hooks post-tool --track-metrics"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "nexus-agents hooks stop --check-tasks"
          }
        ]
      }
    ]
  }
}
```

---

## Alternatives Considered

### 1. Prompt-Based Hooks (LLM Evaluation)

Claude CLI supports `type: "prompt"` hooks that use Haiku for decisions.

**Rejected because:**

- Slower (API call vs local execution)
- Costs money per hook invocation
- Less deterministic

### 2. External Package (claude-flow)

Continue using external packages.

**Rejected because:**

- Unstable alpha releases
- npx overhead on every call
- External dependency for core functionality

### 3. No Hooks

Remove hook functionality entirely.

**Rejected because:**

- Loses metrics tracking capability
- Loses session context awareness
- User requested this feature

---

## Trade-offs

| Aspect          | Pro                                | Con                                |
| --------------- | ---------------------------------- | ---------------------------------- |
| **Performance** | Local execution, no network        | Subprocess overhead (~50ms)        |
| **Reliability** | Stable versioned releases          | Additional CLI entry points        |
| **Integration** | Leverages existing session storage | Must maintain hook protocol compat |
| **Complexity**  | Consolidated tooling               | More code in nexus-agents          |

---

## Implementation Phases

### Phase 1: Core Hook Commands (P1)

- `session-start` and `session-end` handlers
- Basic stdin parsing with Zod validation
- Exit code and JSON output formatting
- Integration with SQLiteSessionStorage

### Phase 2: Tool Hooks (P1)

- `pre-tool` handler with validation
- `post-tool` handler with metrics tracking
- Integration with OrchestrationObserver

### Phase 3: Stop Hook (P2)

- `stop` handler with task checking
- Summary generation (optional)

### Phase 4: Documentation & Setup (P2)

- Update `nexus-agents setup` to configure hooks
- Add hooks documentation to README
- Example configurations

---

## Performance Requirements

- Hook execution must complete in < 100ms for good UX
- No blocking network calls in critical path
- Async metrics persistence (don't block exit)

---

## Success Criteria

- [ ] All hook commands parse Claude CLI stdin format correctly
- [ ] Exit codes match Claude CLI protocol (0, 2, other)
- [ ] JSON output enables decision control
- [ ] Metrics persisted to SQLite session storage
- [ ] `nexus-agents setup` can configure hooks
- [ ] Tests with > 80% coverage
- [ ] Performance < 100ms per hook

---

## References

- [Claude Code Hooks Documentation](https://code.claude.com/docs/en/hooks)
- Issue #411: Claude CLI Hook Integration Commands
- Existing: `packages/nexus-agents/src/cli/session-storage.ts`
- Existing: `packages/nexus-agents/src/agents/observability/orchestration-observer.ts`
