# Nexus Agents Architecture

**Version:** 2.3.0
**Last Updated:** 2026-02-08 (ET)
**Status:** Current

---

## Quick Navigation

| Topic          | Hub (Tier 2)                          | Deep Dive (Tier 3)                                                 |
| -------------- | ------------------------------------- | ------------------------------------------------------------------ |
| Overview       | This file                             | -                                                                  |
| Agent System   | [README](docs/architecture/README.md) | [AGENT_SYSTEM.md](docs/architecture/AGENT_SYSTEM.md)               |
| Memory System  | [README](docs/architecture/README.md) | [MEMORY_SYSTEM.md](docs/architecture/MEMORY_SYSTEM.md)             |
| Routing System | [README](docs/architecture/README.md) | [ROUTING_SYSTEM.md](docs/architecture/ROUTING_SYSTEM.md)           |
| Consensus      | [README](docs/architecture/README.md) | [CONSENSUS_PROTOCOLS.md](docs/architecture/CONSENSUS_PROTOCOLS.md) |
| Security       | [README](docs/architecture/README.md) | [SECURITY.md](docs/architecture/SECURITY.md)                       |
| MCP Protocol   | [README](docs/architecture/README.md) | [MCP_PROTOCOL.md](docs/architecture/MCP_PROTOCOL.md)               |

---

## Overview

Nexus Agents is an intelligent orchestration platform for AI coding tools. It coordinates multiple AI CLIs (Claude, Codex, Gemini, OpenCode) through a single MCP server, routing tasks to the best model using data-driven algorithms, validating outputs through multi-model consensus, and continuously improving through outcome-driven learning.

### Key Features

- **Multi-Model Support**: Claude, OpenAI, Gemini, Ollama adapters
- **Expert System**: Specialized agents (Code, Architecture, Security, etc.)
- **Workflow Engine**: YAML-defined automated workflows
- **MCP Protocol**: Claude Desktop integration via Model Context Protocol
- **11 Consensus Protocols**: Byzantine fault tolerant multi-agent decisions
- **8-Type Memory**: MIRIX-inspired memory architecture
- **Intelligent Routing**: Budget→TOPSIS→LinUCB pipeline

---

## Architectural Direction: Hybrid Architecture

**Decision Date:** 2026-01-11 (ET)
**Consensus:** 5-0 UNANIMOUS (Architect, Security, DevEx, AI/ML, PM)

### Decision

Nexus-agents adopts a **hybrid architecture** combining:

1. **MCP Gateway** - External interface for Claude CLI integration
2. **Internal Event Bus** - Agent-to-agent communication
3. **Standalone CLI Mode** - Non-MCP orchestration
4. **REST API Gateway** - Enterprise/CI/CD integration

### Target Architecture (v3.0.0)

```
┌─────────────────────────────────────────────────────────┐
│              External Interface Layer                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐   │
│  │   MCP    │  │   REST   │  │   Standalone CLI     │   │
│  │ Gateway  │  │   API    │  │   (`nexus-agents`)   │   │
│  └────┬─────┘  └────┬─────┘  └──────────┬───────────┘   │
└───────│─────────────│───────────────────│───────────────┘
        │             │                   │
        └─────────────┴───────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│              Internal Orchestration Layer                │
│  ┌─────────────────────────────────────────────────┐    │
│  │              Event Bus                          │    │
│  │  - Agent-to-agent messaging                     │    │
│  │  - Consensus voting without client roundtrips   │    │
│  │  - Parallel expert coordination                 │    │
│  └───────────────────────┬─────────────────────────┘    │
│                          │                               │
│  ┌──────────┐  ┌─────────▼──────┐  ┌───────────────┐    │
│  │Orchestrtr│  │  Expert Pool   │  │  Consensus    │    │
│  │  Router  │  │ (Code,Sec,etc) │  │  Engine       │    │
│  └──────────┘  └────────────────┘  └───────────────┘    │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────┐
│              Execution Layer                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ CLI Adapters │  │ Model APIs   │  │  Workflows   │   │
│  │ (subprocess) │  │ (HTTP)       │  │  (Engine)    │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Implementation Roadmap

| Phase   | Version | Focus                    | Status |
| ------- | ------- | ------------------------ | ------ |
| Current | v2.0.1  | MCP Server Mode (stable) | ✅     |
| Phase 1 | v2.2.0  | Event Bus + Internal A2A | ✅     |
| Phase 2 | v2.3.0  | Standalone CLI Mode      | -      |
| Phase 3 | v3.0.0  | REST API + Full Hybrid   | -      |

---

## Agent-to-Agent (A2A) Protocol

**Status:** ✅ Fully implemented

The EventBus enables direct agent-to-agent communication without client roundtrips.

### Event Types

| Topic Pattern | Events                             | Description          |
| ------------- | ---------------------------------- | -------------------- |
| `session.*`   | created, status_changed, finalized | Session lifecycle    |
| `consensus.*` | vote_requested, vote_cast, reached | Voting events        |
| `agent.*`     | task_delegated, result_broadcast   | Agent coordination   |
| `protocol.*`  | started, iteration, completed      | Protocol phases      |
| `message.*`   | sent, received                     | Inter-agent messages |
| `byzantine.*` | weight_updated, pattern_detected   | Byzantine detection  |

**Full details:** [AGENT_SYSTEM.md](docs/architecture/AGENT_SYSTEM.md)

---

## Module Structure

```
nexus-agents/
├── packages/
│   └── nexus-agents/       # Single consolidated package
│       └── src/
│           ├── adapters/     # Model adapters + capacity monitor
│           ├── agents/       # Agent framework, experts, collaboration
│           ├── api/          # REST API gateway (Fastify-based)
│           ├── audit/        # SIEM-compatible audit logging
│           ├── benchmarks/   # Performance benchmarking utilities
│           ├── cli/          # CLI interface + mode detection
│           ├── cli-adapters/ # External CLI integrations
│           ├── config/       # Configuration, validation
│           ├── consensus/    # Multi-agent consensus engine
│           ├── context/      # Memory systems
│           ├── core/         # Shared types, Result<T,E>, errors
│           ├── dogfooding/   # Self-referential PR review tooling
│           ├── exports/      # Domain-specific barrel exports
│           ├── indexer/      # Codebase indexing + diagrams
│           ├── learning/     # Feedback and learning infrastructure
│           ├── mcp/          # MCP server, tools
│           ├── observability/ # Swarm-level metrics + dashboards
│           ├── research/     # Research index generation/validation
│           ├── security/     # Sandboxing, isolation, safety-bench
│           ├── self-eval/    # Code review recommendations
│           ├── swe-bench/    # SWE-Bench integration + harness
│           ├── testing/      # Test utilities, mocks, E2E
│           └── workflows/    # Workflow engine, templates
└── ARCHITECTURE.md           # This file
```

### Module Responsibilities

| Module          | Responsibility                                | Deep Dive                                                          |
| --------------- | --------------------------------------------- | ------------------------------------------------------------------ |
| `adapters`      | Model adapters, capacity monitoring           | -                                                                  |
| `agents`        | Agent lifecycle, collaboration, context prune | [AGENT_SYSTEM.md](docs/architecture/AGENT_SYSTEM.md)               |
| `api`           | REST API gateway for non-MCP clients          | -                                                                  |
| `audit`         | SIEM-compatible audit logging, hash chain     | -                                                                  |
| `benchmarks`    | Memory backend performance metrics            | -                                                                  |
| `cli`           | CLI interface, mode detection, commands       | -                                                                  |
| `cli-adapters`  | External CLI integration, routing             | [ROUTING_SYSTEM.md](docs/architecture/ROUTING_SYSTEM.md)           |
| `config`        | Configuration loading and validation          | -                                                                  |
| `consensus`     | Multi-agent voting, weighted decisions        | [CONSENSUS_PROTOCOLS.md](docs/architecture/CONSENSUS_PROTOCOLS.md) |
| `context`       | Token counting, work balancing, memory        | [MEMORY_SYSTEM.md](docs/architecture/MEMORY_SYSTEM.md)             |
| `core`          | Types, Result pattern, errors, logger         | -                                                                  |
| `dogfooding`    | Self-referential PR review tooling            | -                                                                  |
| `exports`       | Domain-specific barrel exports (Issue #285)   | -                                                                  |
| `indexer`       | Codebase indexing, diagrams, freshness        | -                                                                  |
| `learning`      | Feedback collection and learning infra        | -                                                                  |
| `mcp`           | MCP protocol, tools                           | [MCP_PROTOCOL.md](docs/architecture/MCP_PROTOCOL.md)               |
| `observability` | Swarm metrics, interaction graphs, dashboards | -                                                                  |
| `research`      | Research index generation/validation          | -                                                                  |
| `security`      | Sandboxing, isolation, safety-bench eval      | [SECURITY.md](docs/architecture/SECURITY.md)                       |
| `self-eval`     | Code review recommendations, component scan   | -                                                                  |
| `swe-bench`     | SWE-Bench integration and evaluation harness  | -                                                                  |
| `testing`       | Mock adapters, metrics, E2E workflow tests    | -                                                                  |
| `workflows`     | Workflow engine, templates, step execution    | -                                                                  |

---

## Data Flow

### Request Flow (Claude Desktop → Response)

```mermaid
sequenceDiagram
    participant CD as Claude Desktop
    participant MCP as MCP Server
    participant TL as Tech Lead
    participant EX as Expert(s)
    participant AD as Adapter
    participant API as Model API

    CD->>MCP: tool_call(orchestrate)
    MCP->>MCP: Validate input (Zod)
    MCP->>TL: Analyze task
    TL->>EX: Delegate subtasks
    EX->>AD: complete(subtask)
    AD->>API: API request
    API-->>AD: Response
    AD-->>EX: Result<Response>
    EX-->>TL: TaskResult
    TL-->>MCP: Result<TaskResult>
    MCP-->>CD: tool_result
```

---

## Core Interfaces

### IAgent

```typescript
interface IAgent {
  readonly id: string;
  readonly role: AgentRole;
  readonly state: AgentState;
  execute(task: Task): Promise<Result<TaskResult, AgentError>>;
}
```

**Full details:** [AGENT_SYSTEM.md](docs/architecture/AGENT_SYSTEM.md)

### IModelAdapter

```typescript
interface IModelAdapter {
  readonly providerId: string;
  readonly modelId: string;
  complete(request: CompletionRequest): Promise<Result<CompletionResponse, ModelError>>;
}
```

### IWorkflowEngine

```typescript
interface IWorkflowEngine {
  loadTemplate(path: string): Promise<Result<WorkflowDefinition, ParseError>>;
  execute(
    workflow: WorkflowDefinition,
    inputs: Record<string, unknown>
  ): Promise<Result<WorkflowResult, WorkflowError>>;
}
```

---

## Security Architecture

7 defense layers:

1. **Input Validation** - Zod schemas at all boundaries
2. **Secrets Vault** - Never expose API keys or tokens
3. **Rate Limiting** - Token bucket per tool
4. **Memory Bounds** - Context pruning, history caps
5. **Path Safety** - Normalized paths, directory jails
6. **Timeout Protection** - TimeoutGuard for async operations
7. **Byzantine Detection** - Weighted voting with pattern detection

**Full details:** [SECURITY.md](docs/architecture/SECURITY.md)

---

## Configuration

### Config Precedence (highest to lowest)

1. Environment variables (`NEXUS_*`)
2. Project config (`./nexus-agents.yaml`)
3. User config (`~/.config/nexus-agents/config.yaml`)
4. Default values

### Example Config

```yaml
models:
  default: claude-sonnet-4
  tiers:
    fast: [claude-haiku-3, gpt-4o-mini]
    balanced: [claude-sonnet-4, gpt-4o]
    powerful: [claude-opus-4, o1-pro]

routing:
  enableBudgetFilter: true
  enableTopsisRanking: true
  enableLinUCBSelection: true

security:
  sandbox:
    mode: policy
```

---

## Quality Gates

### Pre-Commit

- ESLint (zero errors/warnings)
- TypeScript (zero errors)
- Tests pass
- File limits (≤400 lines)

### Pre-Merge

- 80% test coverage
- Security audit clean
- No deprecated dependencies

---

## References

- [MCP Protocol Specification](https://modelcontextprotocol.io)
- [CODING_STANDARDS.md](./CODING_STANDARDS.md) - Code style guide
- [CLAUDE.md](./CLAUDE.md) - AI assistant instructions
- [docs/ENTRYPOINTS.md](./docs/ENTRYPOINTS.md) - API reference

---

_Last updated: 2026-01-15 (ET)_
_MCP Protocol: 2025-11-25_
