# CLI Integration Project Plan

**Version:** 1.0.0
**Created:** 2026-01-04 (ET)
**Status:** Approved via Agent Consensus

---

## Executive Summary

Integrate Claude CLI, Gemini CLI, and Codex CLI into nexus-agents for capability-matched task routing. All three CLIs support OAuth authentication, eliminating the need for nexus-agents to manage API keys.

### Architecture Decision

**Approved: Phased Hybrid Approach**

After agent voting (2-1-2 split, no supermajority), consensus was reached on a phased implementation:

| Phase   | Mode         | Focus                                   |
| ------- | ------------ | --------------------------------------- |
| Phase 1 | MCP Server   | nexus-agents as MCP tool for Claude CLI |
| Phase 2 | CLI Adapters | Subprocess integration for Gemini/Codex |
| Phase 3 | Hybrid Mesh  | Full bidirectional orchestration        |

---

## Research Summary

### Claude CLI (Claude Code)

| Aspect          | Details                                                     |
| --------------- | ----------------------------------------------------------- |
| **Models**      | Opus 4.5, Sonnet 4.5, Haiku 4.5, extended context (1M beta) |
| **Auth**        | OAuth 2.0 with PKCE, API key helper, Bedrock/Vertex support |
| **MCP**         | Full MCP client, stdio/HTTP/SSE transports                  |
| **Integration** | Agent SDK (TypeScript/Python), `claude -p` non-interactive  |
| **Strengths**   | Complex reasoning (72.5% SWE-bench), architecture decisions |

### Gemini CLI

| Aspect          | Details                                              |
| --------------- | ---------------------------------------------------- |
| **Models**      | Gemini 2.5/3 Pro, Flash variants, 1M token context   |
| **Auth**        | OAuth, ADC, service accounts, auto-detection in GCP  |
| **MCP**         | Full MCP support, stdio/SSE/HTTP                     |
| **Integration** | `gemini -p`, JSON output, YOLO mode                  |
| **Strengths**   | Large codebase analysis, multimodal, bulk operations |

### Codex CLI (OpenAI)

| Aspect          | Details                                                      |
| --------------- | ------------------------------------------------------------ |
| **Models**      | GPT-5.x-codex family (gpt-5.2-codex, gpt-5.1-codex-max/mini) |
| **Auth**        | ChatGPT OAuth, API key via stdin, env var                    |
| **MCP**         | Full MCP support, CAN RUN AS MCP SERVER                      |
| **Integration** | `codex exec --json`, TypeScript SDK                          |
| **Strengths**   | Focused implementation, test generation, parallel tasks      |

---

## Agent Voting Record

### Vote Summary

```
Architect:  C (Hybrid)    - "Maximum flexibility with phased approach"
Security:   A (MCP Server) - "Zero credential handling, minimal attack surface"
DevEx:      A (MCP Server) - "Simplicity, <5min onboarding"
AI/ML:      C (Hybrid)    - "Optimal capability routing"
PM:         B (CLI Orch)  - "Market breadth, vendor agnostic"

Result: 2-1-2 split (no supermajority)
Consensus: Phased approach starting with Option A
```

### Key Amendments Incorporated

1. **Mode Declaration** (Architect): Add `--mode` flag for explicit mode selection
2. **Tool Allowlisting** (Security): Strict validation and rate limiting
3. **Doctor Command** (DevEx): `nexus-agents doctor` for setup validation
4. **Capability Matrix** (AI/ML): Quantitative routing scores
5. **Phase Approach** (PM): Ship MCP first, add orchestration later

---

## Implementation Phases

### Phase 1: MCP Server Mode (v2.2.0)

**Goal:** nexus-agents as enhanced MCP server callable by Claude CLI

**Scope:**

- [x] Existing MCP tools (orchestrate, create_expert, run_workflow)
- [ ] Add `delegate_to_model` tool for capability-matched routing
- [ ] Add model capability metadata to tool responses
- [ ] Document Claude CLI integration in README

**New MCP Tool:**

```typescript
// delegate_to_model - Route task to optimal model
server.tool(
  'delegate_to_model',
  {
    task: z.string().describe('Task to execute'),
    preferred_capability: z.enum(['reasoning', 'context', 'speed', 'code']).optional(),
    model_hint: z.string().optional(),
  },
  async (args) => {
    // Route based on capability matching
    // Returns result + model used + reasoning
  }
);
```

**Success Criteria:**

- [ ] Claude CLI can call nexus-agents via MCP
- [ ] Task routing based on capability matching works
- [ ] Zero credential handling in nexus-agents
- [ ] <5 minute onboarding for Claude CLI users

**Timeline:** 2 weeks

---

### Phase 2: CLI Adapters (v2.3.0)

**Goal:** Add subprocess adapters for Gemini CLI and Codex CLI

**Scope:**

- [ ] `ICliAdapter` interface for subprocess CLIs
- [ ] Gemini CLI adapter (`gemini -p --output-format json`)
- [ ] Codex CLI adapter (`codex exec --json`)
- [ ] Capability-based routing logic
- [ ] Fallback chains for availability

**Interface:**

```typescript
interface ICliAdapter {
  readonly name: 'claude' | 'gemini' | 'codex';
  readonly transport: 'mcp' | 'subprocess';
  readonly capabilities: CapabilityProfile;

  execute(task: Task): Promise<Result<CliResponse, CliError>>;
  healthCheck(): Promise<boolean>;
  getModelInfo(): ModelInfo;
}

interface CapabilityProfile {
  reasoning: number; // 0-10: Complex reasoning ability
  contextWindow: number; // Max tokens
  codeGeneration: number; // 0-10: Code quality
  speed: number; // 0-10: Response latency
  cost: number; // 0-10: Cost efficiency (10 = cheapest)
}
```

**Routing Logic:**

```typescript
function selectAdapter(task: Task): ICliAdapter {
  const profile = analyzeTask(task);

  if (profile.contextRequired > 200_000) return geminiAdapter;
  if (profile.reasoningComplexity > 7) return claudeAdapter;
  if (profile.parallelizable) return codexAdapter;

  return defaultAdapter; // Claude Sonnet
}
```

**Success Criteria:**

- [ ] All three CLIs can be invoked programmatically
- [ ] Routing selects optimal model for task type
- [ ] Fallback works when primary model unavailable
- [ ] OAuth/ADC authentication works without API keys

**Timeline:** 3 weeks

---

### Phase 3: Hybrid Mesh (v3.0.0)

**Goal:** Full bidirectional orchestration with MCP mesh

**Scope:**

- [ ] nexus-agents can run as MCP server (Phase 1)
- [ ] nexus-agents can spawn Codex as MCP server
- [ ] Claude CLI can orchestrate nexus-agents
- [ ] nexus-agents can orchestrate all three CLIs
- [ ] Mode auto-detection based on invocation

**Architecture:**

```
┌─────────────────────────────────────────────────────────┐
│                    Hybrid Mesh                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Claude CLI ◄──MCP──► nexus-agents ◄──MCP──► Codex CLI │
│      │                     │                     │      │
│      │                     │                     │      │
│      └─────────────────────┼─────────────────────┘      │
│                            │                            │
│                     ┌──────▼──────┐                     │
│                     │ Gemini CLI  │                     │
│                     │ (subprocess)│                     │
│                     └─────────────┘                     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Mode Selection:**

```bash
nexus-agents                    # Auto-detect (MCP if stdio, CLI otherwise)
nexus-agents --mode=server      # MCP server for Claude CLI
nexus-agents --mode=orchestrator # CLI orchestrator mode
nexus-agents --mode=mesh        # Full hybrid mesh
```

**Success Criteria:**

- [ ] All three modes work correctly
- [ ] Auto-detection is reliable
- [ ] No circular dependencies in mesh
- [ ] Performance overhead <100ms for mode switching

**Timeline:** 4 weeks

---

## Capability Matching Matrix

| Task Type               | Primary            | Secondary     | Tertiary     |
| ----------------------- | ------------------ | ------------- | ------------ |
| Architecture decisions  | Claude Opus        | Claude Sonnet | Gemini Pro   |
| Complex reasoning       | Claude Opus        | Codex 5.2     | Gemini Pro   |
| Large codebase analysis | Gemini Pro (1M)    | Claude Sonnet | Codex        |
| Code implementation     | Claude Sonnet      | Codex         | Gemini Flash |
| Test generation         | Codex              | Claude Haiku  | Gemini Flash |
| Code review             | Claude Sonnet      | Codex         | Gemini Pro   |
| Bulk operations         | Gemini Flash       | Codex Mini    | Claude Haiku |
| Multimodal (images)     | Gemini Pro         | Claude Sonnet | -            |
| Cost-sensitive          | Gemini (free tier) | Codex Mini    | Claude Haiku |

---

## Security Considerations

### Credential Handling

**Principle:** nexus-agents handles ZERO credentials

| CLI        | Auth Method                   | nexus-agents Role  |
| ---------- | ----------------------------- | ------------------ |
| Claude CLI | OAuth 2.0 / API key helper    | None - CLI manages |
| Gemini CLI | OAuth / ADC / Service account | None - CLI manages |
| Codex CLI  | ChatGPT OAuth / stdin         | None - CLI manages |

### Security Controls

- [ ] Tool allowlisting with version pinning
- [ ] Input validation with Zod at all boundaries
- [ ] Output sanitization before returning
- [ ] Rate limiting per connection (token bucket)
- [ ] Audit logging with rotation
- [ ] Timeout enforcement on all CLI calls
- [ ] Circuit breaker for failing CLIs

---

## Files to Create/Modify

### New Files

| File                                 | Purpose                    |
| ------------------------------------ | -------------------------- |
| `src/cli-adapters/index.ts`          | CLI adapter exports        |
| `src/cli-adapters/types.ts`          | ICliAdapter interface      |
| `src/cli-adapters/claude-adapter.ts` | Claude CLI adapter         |
| `src/cli-adapters/gemini-adapter.ts` | Gemini CLI adapter         |
| `src/cli-adapters/codex-adapter.ts`  | Codex CLI adapter          |
| `src/cli-adapters/router.ts`         | Capability-based routing   |
| `src/mcp/tools/delegate.ts`          | delegate_to_model MCP tool |

### Modified Files

| File                | Changes                            |
| ------------------- | ---------------------------------- |
| `CLAUDE.md`         | Add CLI integration section        |
| `README.md`         | Add hybrid swarm documentation     |
| `src/cli.ts`        | Add --mode flag and mode detection |
| `src/mcp/server.ts` | Register new delegate tool         |

---

## GitHub Issues to Create

### Epic

- **#70** `Epic: v2.2.0-v3.0.0 - CLI Integration and Hybrid Swarm`

### Phase 1 Issues

- `feat(mcp): add delegate_to_model tool for capability routing`
- `docs: add Claude CLI integration guide`
- `feat(cli): add --mode flag for mode selection`

### Phase 2 Issues

- `feat(adapters): add ICliAdapter interface`
- `feat(adapters): implement Gemini CLI adapter`
- `feat(adapters): implement Codex CLI adapter`
- `feat(routing): add capability-based task router`

### Phase 3 Issues

- `feat(mesh): add MCP client capability for Codex`
- `feat(mesh): implement mode auto-detection`
- `feat(mesh): add circuit breaker for CLI failures`

---

## Success Metrics

| Metric                    | Target                       |
| ------------------------- | ---------------------------- |
| Onboarding time (Phase 1) | <5 minutes                   |
| Task routing accuracy     | >85% optimal model selection |
| CLI invocation latency    | <500ms overhead              |
| Availability              | 99.9% with fallback chains   |
| Zero credential exposure  | 100% (audit verified)        |

---

## Open Questions

1. **Model pricing integration:** Should routing consider cost optimization?
2. **Telemetry:** Opt-in usage tracking for routing improvements?
3. **Custom capability profiles:** Allow users to override default profiles?
4. **CLI version pinning:** How to handle breaking CLI updates?

---

## Changelog

| Version | Date       | Changes               |
| ------- | ---------- | --------------------- |
| 1.0.0   | 2026-01-04 | Initial approved plan |

---

_Approved via agent consensus voting per CLAUDE.md protocol_
