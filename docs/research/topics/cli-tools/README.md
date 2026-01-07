# CLI Tools Integration

**Last Updated:** 2026-01-07 (ET)
**Status:** Active Research

---

## Overview

Research on integrating external CLI tools (Claude CLI, Gemini CLI, Codex CLI) with nexus-agents for multi-model orchestration. Covers authentication patterns, capability profiles, and MCP integration.

## CLI Comparison

| CLI            | Version | Models                          | Context | Auth          | MCP Support  |
| -------------- | ------- | ------------------------------- | ------- | ------------- | ------------ |
| **Claude CLI** | 2.0.76  | Opus 4.5, Sonnet 4.5, Haiku 4.5 | 200K    | OAuth 2.0     | Full client  |
| **Gemini CLI** | 0.22.5  | Gemini 2.5/3 Pro, Flash         | 1M+     | OAuth/ADC     | Experimental |
| **Codex CLI**  | 0.77.0  | codex-mini, GPT-5 family        | ~128K   | ChatGPT OAuth | Server mode  |

## Sources

| Source                                                             | Type     | Key Information                        |
| ------------------------------------------------------------------ | -------- | -------------------------------------- |
| [Claude Code Docs](https://docs.anthropic.com/en/docs/claude-code) | Product  | Full MCP client, hooks, session resume |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli)          | Product  | 1M context, model router               |
| [Codex CLI](https://github.com/openai/codex)                       | Product  | Fast code gen, MCP server              |
| [MCP Spec](https://modelcontextprotocol.io)                        | Standard | Protocol 2025-11-25                    |

## Capability Profiles

### Claude CLI

- **Strengths:** Complex reasoning, architecture, code review
- **Best For:** Architecture decisions, security analysis, documentation
- **Context:** 200K tokens standard

### Gemini CLI

- **Strengths:** Long context (1M+), multimodal, fast
- **Best For:** Large codebase analysis, file processing, bulk operations
- **Context:** 1M+ tokens

### Codex CLI

- **Strengths:** Fast code generation, test generation
- **Best For:** Implementation, test writing, quick fixes
- **Context:** ~128K tokens

## Task Routing Strategy

```
Complexity Classification:
  Fast (quick queries)     -> Codex Mini, Gemini Flash, Claude Haiku
  Balanced (most tasks)    -> Claude Sonnet, Gemini Pro, Codex
  Powerful (complex)       -> Claude Opus, Claude Sonnet
```

| Task Type               | Primary       | Secondary     | Tertiary     |
| ----------------------- | ------------- | ------------- | ------------ |
| Architecture decisions  | Claude Opus   | Claude Sonnet | Gemini Pro   |
| Complex reasoning       | Claude Opus   | Codex         | Gemini Pro   |
| Large codebase analysis | Gemini Pro    | Claude Sonnet | Codex        |
| Code implementation     | Claude Sonnet | Codex         | Gemini Flash |
| Test generation         | Codex         | Claude Haiku  | Gemini Flash |
| Bulk operations         | Gemini Flash  | Codex Mini    | Claude Haiku |

## Implementation Architecture

```typescript
interface ICliAdapter {
  readonly name: 'claude' | 'gemini' | 'codex';
  readonly transport: 'mcp' | 'subprocess';
  readonly capabilities: CapabilityProfile;

  execute(task: Task): Promise<Result<CliResponse, CliError>>;
  healthCheck(): Promise<boolean>;
}

interface CapabilityProfile {
  reasoning: number; // 0-10
  contextWindow: number; // Max tokens
  codeGeneration: number; // 0-10
  speed: number; // 0-10
  cost: number; // 0-10 (10 = cheapest)
}
```

## Integration Modes

```bash
nexus-agents --mode=server       # MCP server for Claude CLI
nexus-agents --mode=orchestrator # CLI orchestrator mode
nexus-agents --mode=mesh         # Full hybrid mesh
```

## Implementation Roadmap

1. **Phase 1 (v2.2.0):** MCP Server Mode - nexus-agents as MCP tool
2. **Phase 2 (v2.3.0):** CLI Adapters - Subprocess integration
3. **Phase 3 (v3.0.0):** Hybrid Mesh - Full bidirectional orchestration

## Related Topics

- [Routing](../routing/README.md) - Task-to-model routing
- [Orchestration](../orchestration/README.md) - Multi-agent coordination

## References

- [Claude Code Documentation](https://docs.anthropic.com/en/docs/claude-code)
- [Gemini CLI Repository](https://github.com/google-gemini/gemini-cli)
- [Codex CLI Repository](https://github.com/openai/codex)
- [MCP Protocol Specification](https://modelcontextprotocol.io)
