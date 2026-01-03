# Nexus Agents - Approved Project Plan

**Status:** APPROVED (Unanimous 6/6 Vote)
**Date:** 2026-01-03
**Repository:** https://github.com/williamzujkowski/nexus-agents
**Original Source:** claude-team-mcp (MIT License - attribution preserved)

---

## Executive Summary

This plan outlines the complete rewrite of claude-team-mcp as **Nexus Agents**, a production-grade multi-agent orchestration MCP server. The plan was developed through multi-agent collaboration with contributions from Architect, Security, DevEx, AI/ML, and PM specialist agents, followed by a voting round achieving unanimous consensus.

### Key Decisions

| Decision | Outcome | Rationale |
|----------|---------|-----------|
| **Project Name** | Nexus Agents | Clean rebrand, no confusion with upstream |
| **Architecture** | 7-module monorepo | Clean separation, testable boundaries |
| **MVP Scope** | Claude + Tech Lead + Code Expert | Ship early, iterate fast |
| **Model Selection** | Semantic (embedding-based) | Replace fragile keyword matching |
| **Security Approach** | Defense in depth from Phase 0 | No security debt |
| **Code Standards** | Files ≤400 lines, funcs ≤50 lines | Enforced by linting |

---

## 1. Vision & Core Principles

### 1.1 Mission
Build a production-grade multi-agent orchestration MCP server that coordinates AI experts with model diversity, workflow automation, and security-first design.

### 1.2 Design Principles (Enforced)

| Principle | Enforcement |
|-----------|-------------|
| **Files ≤ 400 lines** | ESLint rule, CI gate |
| **Functions ≤ 50 lines** | ESLint rule, CI gate |
| **Interfaces before implementations** | Phase 0 deliverable |
| **No secrets in logs/code** | Secrets vault, sanitization, pre-commit hook |
| **Type-safe everything** | Strict TypeScript + Zod validation |
| **Test coverage ≥ 80%** | CI gate, no merge without passing |

---

## 2. Architecture

### 2.1 Module Structure

```
nexus-agents/
├── packages/
│   ├── core/           # Shared types, Result<T,E>, errors, logger
│   ├── config/         # Configuration loading, validation, hot reload
│   ├── adapters/       # Model adapters: Claude, OpenAI, Gemini, Ollama
│   ├── agents/         # Agent framework: TechLead, Expert, dynamic creation
│   ├── workflows/      # Workflow engine, templates, state machine
│   ├── mcp/            # MCP server, tool definitions, transport
│   └── cli/            # CLI interface, interactive mode
└── apps/
    └── nexus-agents/   # Main entry point, composition root
```

### 2.2 Core Interfaces

```typescript
// IModelAdapter - Unified model interaction
interface IModelAdapter {
  readonly providerId: string;
  readonly modelId: string;
  complete(request: CompletionRequest): Promise<Result<CompletionResponse, ModelError>>;
  stream(request: CompletionRequest): AsyncIterable<StreamChunk>;
  countTokens(text: string): Promise<number>;
}

// IAgent - Base agent contract
interface IAgent {
  readonly id: string;
  readonly role: AgentRole;
  readonly state: AgentState;
  execute(task: Task): Promise<Result<TaskResult, AgentError>>;
  handleMessage(message: AgentMessage): Promise<Result<AgentResponse, AgentError>>;
}

// IWorkflowEngine - Workflow execution
interface IWorkflowEngine {
  loadTemplate(path: string): Promise<Result<WorkflowDefinition, ParseError>>;
  execute(workflow: WorkflowDefinition, inputs: Record<string, unknown>): Promise<Result<WorkflowResult, WorkflowError>>;
  getStatus(executionId: string): ExecutionStatus;
}
```

### 2.3 Dependency Direction

```
┌─────────────────────────────────────────────────────────────┐
│                        MCP Server                           │
│                  (External boundary)                        │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    Workflow Engine                          │
│              (Orchestrates agent execution)                 │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                      Agents Layer                           │
│           (TechLead, Experts, Dynamic Creation)             │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    Adapters Layer                           │
│          (Claude, OpenAI, Gemini, Ollama)                   │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                       Core Layer                            │
│        (Types, Result<T,E>, Errors, Logger, Config)         │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Security Architecture

### 3.1 Threat Model

| Threat | Attack Vector | Mitigation |
|--------|---------------|------------|
| Path Traversal | `../../etc/passwd` in file paths | Path normalization, directory jail |
| ReDoS | Malicious regex in patterns | Use minimatch, no user RegExp |
| Secrets Exposure | Logging, error messages | Secrets vault, sanitization middleware |
| Token Exhaustion | Unbounded context | Memory caps, pruning |
| Injection | Malformed prompts | Input validation, Zod schemas |

### 3.2 Security Patterns

| Pattern | Implementation |
|---------|----------------|
| **Secrets Vault** | Sealed object, never in process.env |
| **Input Validation** | Zod schemas at all boundaries |
| **Rate Limiting** | Token bucket per tool |
| **Memory Bounds** | Context pruning, history caps |
| **Path Safety** | Normalized paths, resolved relative to allowed roots |

### 3.3 Security Testing

- npm audit in CI (fail on high/critical)
- Dependency review on PRs
- Path traversal test suite
- Pre-commit hook for secrets detection

---

## 4. AI/ML Design Standards

### 4.1 Prompt Structure

```
[ROLE DEFINITION]
You are a {role_name} specialized in {domain}.

[TASK CONTEXT]
Current objective: {task_description}
Constraints: {constraints}

[FEW-SHOT EXAMPLES]
Example 1: Input → Output
Example 2: Input → Output

[INPUT]
{actual_input}

[OUTPUT FORMAT]
{json_schema}
```

### 4.2 Dynamic Temperature

| Task Type | Temperature |
|-----------|-------------|
| Code generation | 0.2-0.3 |
| Code review | 0.3-0.4 |
| Creative planning | 0.6-0.7 |
| Refinement iterations | 0.5 → 0.2 (decreasing) |

### 4.3 Model Selection

- **Semantic classification**: Embedding similarity to task archetypes
- **Tier escalation**: Fast → Balanced → Powerful on validation failures
- **Token efficiency**: Target <1% waste

### 4.4 Quality Assurance

```
Generate → Validate → Pass (≥0.75) → Output
              ↓
         Fail (<0.75)
              ↓
         Feedback → Retry (max 3) → Escalate tier
```

---

## 5. Developer Experience

### 5.1 Zero-Config Quick Start

```bash
npm install -g nexus-agents
ANTHROPIC_API_KEY=sk-... nexus-agents
```

### 5.2 CLI Commands

```bash
nexus-agents                    # Start MCP server
nexus-agents --interactive      # REPL mode
nexus-agents config init        # Generate config
nexus-agents expert list        # List experts
nexus-agents workflow run <n>   # Execute workflow
```

### 5.3 Configuration (YAML)

```yaml
models:
  default: claude-sonnet
  tiers:
    fast: [claude-haiku, gpt-4o-mini]
    balanced: [claude-sonnet, gpt-4o]
    powerful: [claude-opus, o1-pro]

experts:
  custom:
    rust_expert:
      prompt: "You are a Rust expert..."
      tier: powerful
```

---

## 6. Phased Timeline

### Phase 0: Foundation
- Monorepo structure
- TypeScript strict + ESLint rules
- Core interfaces (no implementations)
- Result<T,E>, error hierarchy
- Structured logging, Zod config
- CI pipeline

**Gate:** `npm run typecheck && npm run lint` pass

### Phase 1: Model Adapters
- Claude adapter (MVP required)
- OpenAI/Gemini/Ollama (v0.2.0)
- Model registry, rate limiting, retries

**Gate:** Claude adapter completes request

### Phase 2: Core Agents
- IAgent implementation
- TechLead agent
- Agent lifecycle, state machine
- Context management

**Gate:** Tech Lead analyzes task

### Phase 3: Expert System
- 5 built-in experts
- Dynamic expert factory
- Expert collaboration protocol

**Gate:** Experts collaborate on task

### Phase 4: Workflow Engine (v0.3.0)
- Workflow parser
- Step executor
- Parallel execution
- Built-in templates

**Gate:** Workflow executes successfully

### Phase 5: MCP Server
- MCP server (stdio)
- Tools: orchestrate, create_expert, run_workflow, etc.
- Validation, logging

**Gate:** Claude Desktop integration works

### Phase 6: Production (v1.0.0)
- Memory leak fixes
- Performance optimization
- Security audit
- Full documentation
- npm publish

**Gate:** 24h soak test passes

---

## 7. Version Roadmap

| Version | Codename | Scope |
|---------|----------|-------|
| **v0.1.0** | Foundation | Claude + Tech Lead + Code Expert |
| **v0.2.0** | Expansion | All adapters + All experts |
| **v0.3.0** | Automation | Workflow engine |
| **v1.0.0** | Production | Hardening + npm publish |

---

## 8. Success Metrics

### Quality Gates
- Test coverage ≥ 80%
- Zero lint warnings
- No file > 400 lines
- All public APIs documented

### Performance Targets
- Startup time < 2s
- Memory usage < 500MB
- Token waste < 1%

### Functional Targets
- Task completion > 90%
- Expert selection accuracy > 85%
- Workflow success > 95%

---

## 9. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| API rate limits | Response caching, exponential backoff |
| Context overflow | Summarization, bounded history |
| Memory leaks | Profiling from Phase 0, soak testing |
| Security vulnerabilities | Prompt sandboxing, capability allowlist |

---

## 10. Voting Record

| Agent | Vote | Key Feedback |
|-------|------|--------------|
| Architect | APPROVE | Clean separation, correct dependencies |
| Security | APPROVE | Security-forward, patterns well-embedded |
| DevEx | APPROVE | All criteria passed |
| AI/ML | APPROVE | Comprehensive AI standards |
| PM | APPROVE | Realistic phasing, measurable metrics |
| Orchestrator | APPROVE | Synthesis successful |

**Final Result:** 6/6 APPROVE - Unanimous Consensus

---

## 11. Next Steps

1. **Initialize Repository**
   - Clone template structure
   - Set up monorepo with pnpm/turborepo
   - Configure TypeScript, ESLint, Prettier

2. **Implement Phase 0**
   - Create all interface files
   - Set up CI pipeline
   - Document architecture in ARCHITECTURE.md

3. **Begin Phase 1**
   - Implement Claude adapter first
   - Add integration tests with mocks

---

*Plan approved by multi-agent consensus on 2026-01-03*
*Original: claude-team-mcp | Rewrite: Nexus Agents*
*License: MIT (attribution preserved)*
