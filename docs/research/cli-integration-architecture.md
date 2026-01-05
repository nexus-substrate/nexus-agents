# CLI Integration Architecture Research

**Version:** 1.0.0
**Date:** 2026-01-04 (ET)
**Status:** Active Research

---

## Executive Summary

This document captures research findings from testing Claude CLI, Gemini CLI, and Codex CLI to design an **evergreen** integration architecture that:

- Maximizes parallel agent capabilities
- Minimizes maintenance burden
- Maximizes compatibility with CLI updates
- Provides future-proof integration patterns

---

## CLI Capabilities Matrix

| Feature              | Claude CLI (v2.0.76)             | Gemini CLI (v0.22.5) | Codex CLI (v0.77.0)    |
| -------------------- | -------------------------------- | -------------------- | ---------------------- |
| Non-interactive mode | `-p, --print`                    | Positional query     | `exec` subcommand      |
| JSON output          | `--output-format json`           | `-o json`            | `--json` (NDJSON)      |
| Stream JSON          | `--output-format stream-json`    | `-o stream-json`     | Built-in streaming     |
| Model selection      | `--model <model>`                | `-m, --model`        | `-m, --model`          |
| MCP Server mode      | **No** (client only)             | **No** (client only) | **Yes** (`mcp-server`) |
| MCP Client           | Yes                              | Yes                  | Yes                    |
| Session resume       | `--resume`, `--continue`         | `--resume`           | `resume` subcommand    |
| Custom system prompt | `--system-prompt`                | N/A                  | Via config             |
| Tool allowlisting    | `--allowedTools`                 | `--allowed-tools`    | Via config             |
| Sandbox mode         | `--dangerously-skip-permissions` | `-s, --sandbox`      | `-s, --sandbox`        |

---

## JSON Output Formats

### Claude CLI

```json
{
  "type": "result",
  "subtype": "success",
  "is_error": false,
  "duration_ms": 8189,
  "result": "The response text",
  "session_id": "813a7942-018b-4538-8c6c-9b6d57cee226",
  "total_cost_usd": 0.35,
  "usage": {
    "input_tokens": 1,
    "cache_creation_input_tokens": 42708,
    "cache_read_input_tokens": 0,
    "output_tokens": 5
  },
  "modelUsage": {
    "claude-opus-4-5-20251101": {
      "inputTokens": 4,
      "outputTokens": 30,
      "cacheReadInputTokens": 0,
      "cacheCreationInputTokens": 53783,
      "costUSD": 0.33691375,
      "contextWindow": 200000
    }
  }
}
```

**Key fields:**

- `result` - The response text
- `is_error` - Whether execution failed
- `usage` - Aggregate token usage
- `modelUsage` - Per-model breakdown with cost
- `session_id` - For resuming conversations

### Gemini CLI

```json
{
  "session_id": "9256cd73-11b4-4520-b0ac-6cec748d0cda",
  "response": "The response text",
  "stats": {
    "models": {
      "gemini-2.5-flash-lite": {
        "api": {
          "totalRequests": 1,
          "totalErrors": 0,
          "totalLatencyMs": 1112
        },
        "tokens": {
          "input": 3204,
          "prompt": 3204,
          "candidates": 60,
          "total": 3405,
          "cached": 0,
          "thoughts": 141,
          "tool": 0
        }
      }
    }
  }
}
```

**Key fields:**

- `response` - The response text
- `session_id` - For resuming conversations
- `stats.models.<model>.tokens` - Token usage per model

### Codex CLI (NDJSON Stream)

```json
{"type":"thread.started","thread_id":"019b8b42-d432-78b3-af10-0e632871bab3"}
{"type":"turn.started"}
{"type":"item.completed","item":{"id":"item_0","type":"reasoning","text":"Thinking..."}}
{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"The response"}}
{"type":"turn.completed","usage":{"input_tokens":4078,"cached_input_tokens":3200,"output_tokens":7}}
```

**Key fields:**

- `type: "item.completed"` with `item.type: "agent_message"` - The response
- `type: "turn.completed"` with `usage` - Token usage
- `thread_id` - For resuming conversations

---

## Architectural Decision: Evergreen Integration Pattern

### Problem Statement

CLI tools evolve rapidly. Each release may change:

- Command-line arguments
- JSON output format
- Authentication methods
- Feature availability

We need an architecture that:

1. Isolates CLI-specific logic in adapters
2. Uses stable protocols where possible (MCP > subprocess)
3. Parses defensively (ignore unknown fields, don't fail on extras)
4. Validates versions and gracefully degrades

### Recommended Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     nexus-agents Orchestrator                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    ICliAdapter Interface                      │   │
│  │  execute(task): Promise<Result<CliResponse, CliError>>       │   │
│  │  healthCheck(): Promise<HealthStatus>                         │   │
│  │  getCapacity(): Promise<CapacityStatus>                       │   │
│  │  getVersion(): Promise<string>                                │   │
│  └─────────────────────────────────────────────────────────────┘   │
│           ▲                    ▲                    ▲               │
│           │                    │                    │               │
│  ┌────────┴────────┐  ┌───────┴───────┐  ┌────────┴────────┐       │
│  │ ClaudeAdapter   │  │ GeminiAdapter │  │ CodexAdapter    │       │
│  │ (MCP Client)    │  │ (Subprocess)  │  │ (MCP Server)    │       │
│  │                 │  │               │  │                 │       │
│  │ - Uses MCP      │  │ - Spawns CLI  │  │ - Connects to   │       │
│  │   protocol      │  │ - Parses JSON │  │   Codex MCP     │       │
│  │ - Most stable   │  │ - Defensive   │  │ - Most stable   │       │
│  └─────────────────┘  └───────────────┘  └─────────────────┘       │
│           │                    │                    │               │
└───────────┼────────────────────┼────────────────────┼───────────────┘
            │                    │                    │
            ▼                    ▼                    ▼
     ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
     │ Claude CLI  │      │ Gemini CLI  │      │ Codex CLI   │
     │ (MCP Server)│      │ (Subprocess)│      │ (MCP Server)│
     └─────────────┘      └─────────────┘      └─────────────┘
```

### Transport Hierarchy (Stability Order)

1. **MCP Protocol** (Most Stable)
   - Versioned protocol specification
   - Standard request/response format
   - Error handling built-in
   - Used by: Claude (as MCP client), Codex (as MCP server)

2. **Subprocess with JSON** (Moderately Stable)
   - CLI may change output format between versions
   - Requires defensive parsing
   - Used by: Gemini

3. **Subprocess with Text** (Least Stable)
   - Fragile regex parsing
   - Only as fallback
   - Not recommended for production

### Defensive Parsing Strategy

```typescript
interface CliResponseParser<T> {
  // Parse response, returning null for unrecognized formats
  parse(raw: string): T | null;

  // Extract just the response text (most stable field)
  extractResponse(raw: string): string | null;

  // Extract token usage (may not be present)
  extractUsage(raw: string): TokenUsage | null;

  // Version this parser supports
  supportedVersionRange: string;
}

// Example: Claude response parser
class ClaudeResponseParser implements CliResponseParser<ClaudeResponse> {
  parse(raw: string): ClaudeResponse | null {
    try {
      const data = JSON.parse(raw);
      // Only require the essential field
      if (typeof data.result !== 'string') return null;
      return data as ClaudeResponse;
    } catch {
      return null;
    }
  }

  extractResponse(raw: string): string | null {
    const parsed = this.parse(raw);
    return parsed?.result ?? null;
  }
}
```

### Version Compatibility

```typescript
interface CliVersionRequirements {
  claude: {
    minimum: '2.0.0';
    recommended: '2.0.76';
    breaking: ['3.0.0']; // Known breaking versions
  };
  gemini: {
    minimum: '0.20.0';
    recommended: '0.22.5';
    breaking: [];
  };
  codex: {
    minimum: '0.70.0';
    recommended: '0.77.0';
    breaking: [];
  };
}

async function validateCliVersion(cli: string): Promise<VersionStatus> {
  const version = await getCliVersion(cli);
  const requirements = CLI_VERSION_REQUIREMENTS[cli];

  if (semver.lt(version, requirements.minimum)) {
    return { status: 'unsupported', upgrade: true };
  }
  if (requirements.breaking.some((v) => semver.gte(version, v))) {
    return { status: 'breaking', message: 'Known incompatible version' };
  }
  if (semver.lt(version, requirements.recommended)) {
    return { status: 'outdated', upgrade: true };
  }
  return { status: 'supported' };
}
```

---

## Integration Strategy per CLI

### Claude CLI Strategy

**Transport:** MCP Protocol (nexus-agents as MCP server)

**Rationale:**

- Claude CLI is already an MCP client
- nexus-agents is already an MCP server
- Most stable integration possible
- No subprocess management needed when Claude is orchestrator

**Integration Pattern:**

```bash
# Claude CLI calls nexus-agents tools via MCP
claude --mcp-config nexus-agents.json "Analyze this codebase"
```

**For outbound orchestration (nexus-agents calling Claude):**

```typescript
// Use subprocess with JSON output
const result = await exec('claude', ['-p', '--output-format', 'json', task]);
const parsed = claudeParser.parse(result.stdout);
```

### Gemini CLI Strategy

**Transport:** Subprocess with JSON output

**Rationale:**

- No MCP server mode available
- JSON output is stable
- Simple integration

**Integration Pattern:**

```typescript
async execute(task: string): Promise<CliResponse> {
  const result = await exec('gemini', [task, '-o', 'json']);
  return geminiParser.parse(result.stdout);
}
```

### Codex CLI Strategy

**Transport:** MCP Protocol (Codex as MCP server)

**Rationale:**

- Codex supports running as MCP server (`codex mcp-server`)
- Most stable integration for Codex
- Enables bidirectional communication
- Future-proof as MCP protocol evolves

**Integration Pattern:**

```typescript
// Spawn Codex as MCP server
const codexProcess = spawn('codex', ['mcp-server']);
const transport = new StdioClientTransport(codexProcess.stdin, codexProcess.stdout);
const client = new Client({ name: 'nexus-agents' });
await client.connect(transport);

// Call tools via MCP
const result = await client.callTool({ name: 'execute', arguments: { task } });
```

---

## Recommended Implementation Order

1. **Phase 2a: Core Interface** (1 day)
   - Define `ICliAdapter` interface
   - Create `CliResponse` type hierarchy
   - Implement defensive parsers

2. **Phase 2b: Codex MCP Adapter** (2 days)
   - Most stable integration
   - Spawns Codex as MCP server
   - Full MCP protocol support

3. **Phase 2c: Claude Subprocess Adapter** (1 day)
   - For when nexus-agents orchestrates Claude
   - JSON output parsing
   - Session management

4. **Phase 2d: Gemini Subprocess Adapter** (1 day)
   - JSON output parsing
   - Defensive parsing for format changes

5. **Phase 2e: Router Implementation** (2 days)
   - Capability-based routing
   - Capacity-aware assignment
   - Fallback chains

---

## Future Considerations

### MCP Protocol Evolution

The MCP protocol is versioned. Monitor:

- Protocol version changes
- New transport options
- Tool schema evolution

### CLI Breaking Changes

Maintain a compatibility matrix and update adapters when:

- Major version releases
- Deprecated flag removals
- Output format changes

### Adding New CLIs

New AI CLIs should be evaluated for:

1. MCP server support (preferred)
2. JSON output support (acceptable)
3. Stable API key-free auth (required)

---

## References

- [MCP Protocol Specification 2025-11-25](https://modelcontextprotocol.io)
- [Claude CLI Documentation](https://docs.anthropic.com/claude-code)
- [Gemini CLI Documentation](https://ai.google.dev/gemini-cli)
- [Codex CLI Documentation](https://openai.com/codex)

---

_Research conducted: 2026-01-04 (ET)_
_CLI versions tested: Claude 2.0.76, Gemini 0.22.5, Codex 0.77.0_
