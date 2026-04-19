# CLI Tools Integration

**Last Updated:** 2026-04-19 (ET)
**Status:** Active Research

---

## Overview

Research on integrating external CLI tools (Claude CLI, Gemini CLI, Codex CLI, OpenCode) plus OpenRouter-backed free models with nexus-agents for multi-model orchestration. Covers authentication patterns, capability profiles, and MCP integration. The live, canonical model registry (pricing, quality, context windows) lives in [`packages/nexus-agents/src/config/model-capabilities.ts`](../../../../packages/nexus-agents/src/config/model-capabilities.ts) — prefer it over this summary when they disagree.

## CLI Comparison

| CLI            | Models                                                                           | Context | Auth                         | MCP Support   |
| -------------- | -------------------------------------------------------------------------------- | ------- | ---------------------------- | ------------- |
| **Claude CLI** | Opus 4.7 (1M), Sonnet 4.6, Haiku 4.5                                             | 200K–1M | OAuth 2.0 / API key          | Full client   |
| **Gemini CLI** | Gemini 3 Pro, Gemini 3 Flash (+ 2.5 family)                                      | 1M+     | OAuth/ADC                    | Experimental  |
| **Codex CLI**  | codex-5.3, codex-5.2, codex-5.1-mini                                             | ~200K   | ChatGPT OAuth / API key      | Server mode   |
| **OpenCode**   | `opencode/*` default models + custom `custom-opus`/`custom-sonnet` via Anthropic | Varies  | Inherits Claude / OpenRouter | Full client   |
| **OpenRouter** | `openrouter-nemotron-super`, `openrouter-qwen-coder` (free tier)                 | Varies  | OpenRouter API key           | n/a (adapter) |

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

| Task Type               | Primary        | Secondary      | Tertiary                 |
| ----------------------- | -------------- | -------------- | ------------------------ |
| Architecture decisions  | Gemini 3 Pro   | Claude Opus    | Claude Sonnet            |
| Complex reasoning       | Claude Opus    | Codex 5.3      | Gemini 3 Pro             |
| Large codebase analysis | Gemini 3 Pro   | Claude Sonnet  | Codex 5.3                |
| Code implementation     | Claude Sonnet  | Codex 5.3      | OpenCode (custom-sonnet) |
| Test generation         | Codex 5.3      | Claude Haiku   | Gemini 3 Flash           |
| Security review         | Codex 5.3      | Claude Opus    | Gemini 3 Pro             |
| Bulk operations         | Gemini 3 Flash | Codex 5.1-mini | Claude Haiku             |

Routing primaries reflect CATEGORY-level overrides in `composite-router.ts` / `cli-adapters/composite-router-helpers.ts` as of 2026-04-19; the canonical registry remains the single source of truth.

## Implementation Architecture

```typescript
interface ICliAdapter {
  readonly name: 'claude' | 'gemini' | 'codex' | 'opencode';
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
