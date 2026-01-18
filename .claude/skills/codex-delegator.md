---
name: codex-delegator
description: |
  Delegate code generation tasks to Codex CLI for optimal performance.
  Use when implementing features, generating tests, refactoring code, or
  making bulk code changes. Triggers on "delegate to codex", "route to codex",
  "use codex", "code generation".
allowed-tools: Bash, Read, Glob, Grep, Task
---

# Codex Delegator Skill

<!-- CANONICAL SOURCES:
  - docs/architecture/ROUTING_SYSTEM.md
  - packages/nexus-agents/src/mcp/tools/delegate-to-model.ts
  - packages/nexus-agents/src/cli-adapters/adapters/codex-adapter.ts
-->

**Full documentation:**

- [ROUTING_SYSTEM.md](../../docs/architecture/ROUTING_SYSTEM.md)
- [ENTRYPOINTS.md](../../docs/ENTRYPOINTS.md)

## When to Use Codex

Codex excels at:

| Task Type         | Examples                                           |
| ----------------- | -------------------------------------------------- |
| Code Generation   | Implement functions, create classes, add features  |
| Test Generation   | Write unit tests, integration tests, test fixtures |
| Refactoring       | Extract methods, rename variables, restructure     |
| Code Completion   | Complete partial implementations, fill in stubs    |
| Bulk Code Changes | Apply patterns across multiple files               |

**Do NOT use for:** Architecture decisions, security review, documentation-heavy tasks.

## Delegation Methods

### Method 1: MCP Tool (Recommended)

Use the `delegate_to_model` MCP tool for intelligent routing:

```
delegate_to_model(task: "Implement a binary search function in TypeScript")
```

The CompositeRouter automatically routes to Codex when:

- Task contains code generation keywords ("implement", "write", "create")
- Task is primarily code-focused (low reasoning complexity)
- Budget constraints favor Codex cost efficiency

### Method 2: Direct CLI Execution

For explicit Codex invocation:

```bash
# Via nexus-agents CLI
nexus-agents orchestrate "Implement sorting algorithm" --cli=codex

# Via codex directly
codex exec -m o3 "Implement a binary search function"
```

### Method 3: Routing Audit

Check routing decisions before execution:

```bash
nexus-agents routing-audit "Implement authentication middleware" --format=json
```

## Task Profiling

The router analyzes tasks using these signals:

| Signal             | Boost Codex When                         |
| ------------------ | ---------------------------------------- |
| `codeGeneration`   | Keywords: implement, write, create       |
| `reasoningSimple`  | No "design", "architect", "analyze"      |
| `budgetSensitive`  | Keywords: quick, simple, straightforward |
| `technicalContext` | References to APIs, frameworks, libs     |

## Examples

### Generate Unit Tests

```
delegate_to_model(task: "Write Jest tests for the UserService class covering:
- createUser with valid input
- createUser with invalid email
- getUserById with existing user
- getUserById with non-existent user")
```

### Implement Feature

```
delegate_to_model(task: "Implement a rate limiter middleware for Express.js that:
- Uses sliding window algorithm
- Supports configurable limits per route
- Returns 429 status when limit exceeded")
```

### Refactor Code

```
delegate_to_model(task: "Refactor the payment processing module to:
- Extract validation logic into separate functions
- Replace callbacks with async/await
- Add TypeScript types for all parameters")
```

### Bulk Changes

```
delegate_to_model(task: "Add JSDoc comments to all exported functions in src/utils/")
```

## Routing Decision Flow

```
Task Input
    |
    v
TaskAnalyzer (profile task)
    |
    v
BudgetRouter (filter by constraints)
    |
    v
TopsisRouter (rank: quality 50%, cost 30%, latency 20%)
    |
    v
LinUCBBandit (contextual learning)
    |
    v
Codex selected if: high codeGeneration + low reasoningComplexity
```

## Codex Capabilities

| Capability      | Score  | Notes                            |
| --------------- | ------ | -------------------------------- |
| Code Generation | 0.95   | Primary strength                 |
| Context Window  | 400K   | Large file support               |
| Cost Efficiency | High   | Lower than Claude for code tasks |
| Latency         | Medium | Optimized for code completion    |

## Fallback Behavior

If Codex is unavailable:

1. Circuit breaker detects failure
2. Router falls back to Claude or Gemini
3. Task executes with alternative CLI
4. Outcome recorded for learning

## Configuration

```yaml
# nexus-agents.yaml
routing:
  enableTopsisRanking: true
  enableLinUCBSelection: true

  topsis:
    qualityWeight: 0.5
    costWeight: 0.3
    latencyWeight: 0.2
```

## Debugging

```bash
# Check Codex availability
nexus-agents doctor

# View routing decision for task
nexus-agents routing-audit "task description" --verbose

# Show bandit learning stats
nexus-agents routing-audit "task" --bandit-stats
```
