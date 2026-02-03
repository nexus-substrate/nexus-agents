# Nexus Agents - Claude Code Instructions

**Project:** Multi-agent orchestration MCP server
**Repository:** github.com/williamzujkowski/nexus-agents
**Owner:** @williamzujkowski

---

## Quick Reference

```bash
# Development
pnpm install              # Install dependencies
pnpm dev                  # Start dev server
pnpm build                # Build all packages
pnpm test                 # Run tests
pnpm lint                 # Lint code
pnpm typecheck            # Type check

# GitHub CLI
gh issue create           # Create issue
gh pr create              # Create PR
gh pr merge               # Merge PR

# Nexus-Agents CLI
nexus-agents doctor       # Check CLI health
nexus-agents orchestrate  # Standalone task execution
nexus-agents vote         # Consensus voting (5 agents)
nexus-agents fitness-audit # CLI fitness score audit
nexus-agents --help       # Full command list
```

**Full CLI/MCP/REST reference:** [docs/ENTRYPOINTS.md](./docs/ENTRYPOINTS.md)

---

## Prerequisites & Environment

**Required:** Node.js 22.x LTS, pnpm 9.x (or npm 10.x)
**Optional:** Docker (sandbox mode), Claude CLI (MCP mode)

| Variable             | Required For       | Default               |
| -------------------- | ------------------ | --------------------- |
| `ANTHROPIC_API_KEY`  | Claude adapter     | None                  |
| `OPENAI_API_KEY`     | OpenAI adapter     | None                  |
| `GOOGLE_AI_API_KEY`  | Gemini adapter     | None                  |
| `NEXUS_LOG_LEVEL`    | Logging verbosity  | `info`                |
| `NEXUS_CONFIG_PATH`  | Custom config path | `./nexus-agents.yaml` |
| `NEXUS_AUTH_ENABLED` | MCP authentication | `false` (disabled)    |

**Getting started:** [docs/getting-started/INSTALLATION.md](./docs/getting-started/INSTALLATION.md) | **Configuration:** [docs/getting-started/CONFIGURATION.md](./docs/getting-started/CONFIGURATION.md)

---

## Core Principles

### Prime Directive

```
correctness > simplicity > performance > cleverness
```

- **Correctness**: Does it work? Handles edge cases? Tested?
- **Simplicity**: Can someone understand it in 5 minutes?
- **Performance**: Does it meet requirements? (not theoretical optimality)
- **Cleverness**: Never. Clever code is maintenance debt.

Produce software with explicit error handling, observable state changes, and no silent failures.

### Documentation Style

Write like a technically precise engineer. Be direct, honest, and clear. No marketing fluff.

**Do:** State what something does precisely. Admit limitations honestly. Provide working examples.
**Do Not:** Exaggerate capabilities. Claim features that don't exist. Use vague marketing language.

### Anti-Sprawl Policy

**ONE canonical implementation path** for each system concern. Never fork — refactor.

- Modify existing files over creating new ones
- Extend existing modules over creating parallel implementations
- Never create `enhanced_*`, `new_*`, `v2_*`, `refactor_*` files

### Ask vs Assume

**Always clarify (never assume) for:** deployment env, expected scale, consistency needs, security/PII, breaking changes.

**Safe to assume:** TypeScript strict mode, UTF-8, JSON serialization, async/await, dependency injection.

### Time Authority

All operations use **America/New_York (ET)** timezone. Verify with `TZ='America/New_York' date` before time-sensitive operations.

### Research-First

Before implementing features or making architectural decisions: search official docs, check best practices, verify version compatibility. Create a GitHub issue with findings. See [docs/research/CONTRIBUTING.md](./docs/research/CONTRIBUTING.md) for the research tracking system.

---

## Canonical Paths

| Concern              | Canonical Path        | Location                                         |
| -------------------- | --------------------- | ------------------------------------------------ |
| **Task Analysis**    | `SharedTaskAnalyzer`  | `src/core/task-analysis/shared-task-analyzer.ts` |
| **Task Routing**     | `CompositeRouter`     | `src/cli-adapters/composite-router.ts`           |
| **Consensus Voting** | `ConsensusEngine`     | `src/consensus/engine.ts`                        |
| **CLI Adapters**     | `createAllAdapters()` | `src/cli-adapters/factory.ts`                    |
| **MCP Tools**        | `registerTools()`     | `src/mcp/tools/index.ts`                         |

All task routing goes through: `Task → BudgetRouter → ZeroRouter → PreferenceRouter → TopsisRouter → LinUCB → Selected Model`

Do NOT directly instantiate stage routers. Use `CompositeRouter.route(task)`.

When a non-canonical implementation exists, migrate its logic to the canonical location, then remove the deprecated file.

---

## Agent Delegation

| Subagent Type     | Use When                                    | Tools                   |
| ----------------- | ------------------------------------------- | ----------------------- |
| `Explore`         | Quick codebase searches, read-only analysis | Read, Glob, Grep        |
| `general-purpose` | Complex multi-step tasks                    | All tools               |
| `researcher`      | Deep research, documentation gathering      | Web, Read               |
| `coder`           | Implementation tasks                        | Read, Edit, Write, Bash |
| `reviewer`        | Code review, security audit                 | Read, Grep              |
| `tester`          | Test writing, coverage analysis             | Read, Edit, Bash        |

- Spawn subagents for tasks taking >5 tool calls
- Use `Explore` for any codebase navigation
- Use parallel subagents for independent tasks

**Context load balancing** (Claude/Codex/Gemini routing): see [CONTEXT_LOAD_BALANCING.md](./docs/architecture/CONTEXT_LOAD_BALANCING.md) or use the `codex-delegator` / `gemini-delegator` skills.

---

## Context Budget

| Task Type          | Budget | Use For                                |
| ------------------ | ------ | -------------------------------------- |
| Minimal (quick)    | ~800   | Simple questions, file lookups         |
| Standard (feature) | ~2,500 | Feature implementation, code review    |
| Research           | ~1,500 | Documentation gathering, analysis      |
| Full (system)      | ~6,000 | System reviews, architecture decisions |

**Preservation:** Use subagents for exploration. Summarize large outputs. Reference by path instead of inlining. Start fresh conversation when switching unrelated tasks.

---

## Error Handling

### Q Protocol

Before uncertain actions:

```
DOING: [action]   EXPECT: [outcome]
IF YES: [next step]   IF NO: [fallback]
```

After: `RESULT: [what happened]  MATCHES: yes/no  THEREFORE: [conclusion]`

### Failure Response

1. State what failed with raw error
2. State theory of cause
3. Propose ONE next action
4. State expected outcome
5. Wait for confirmation

**Never:** silent retries, best-effort guessing, continuing without addressing failure.

---

## Self-Check Quality Gate

Before completing ANY implementation task:

- [ ] Names reflect intent (no abbreviations except standard: id, url)
- [ ] Functions do ONE thing (if "and" in description, split)
- [ ] Errors handled with timeout/retry where applicable
- [ ] Tests cover happy path + edge cases + error cases
- [ ] No unexplained literal values (constants have documented intent)
- [ ] No unnecessary abstraction

---

## Discovered Issues

When finding issues during work, create a GitHub issue **IMMEDIATELY**. See the `dogfooding-issues` skill for the full protocol.

**Quick:** `gh issue create --title "{type}: {description}" --label "{label},discovered"`

Types: `bug:`, `tech-debt:`, `docs:`, `test:`, `perf:`, `security:`, `research:`

Rate limit: max 5 auto-created issues per hour. Check for duplicates first.

---

## Workflows (via Skills)

Detailed workflow steps are in `.claude/skills/`:

| Workflow               | Skill                      | Trigger Keywords                  |
| ---------------------- | -------------------------- | --------------------------------- |
| Feature implementation | `implement-feature`        | "implement", "add feature"        |
| Bug fix                | `bug-fix`                  | "fix bug", "debug"                |
| Hotfix                 | `hotfix`                   | "hotfix", "emergency fix"         |
| Release                | `release`                  | "release", "publish"              |
| Code review            | `reviewing-code`           | "review code", "code review"      |
| Research + voting      | `research-and-vote`        | "research", "investigate"         |
| System review          | `system-review`            | "system review", "project health" |
| Dogfooding issues      | `dogfooding-issues`        | "dogfood", "process issues"       |
| Version check          | `version-check`            | "check versions", "version audit" |
| Documentation mgmt     | `documentation-management` | "doc sync", "documentation"       |
| Codex delegation       | `codex-delegator`          | "delegate to codex"               |
| Gemini delegation      | `gemini-delegator`         | "delegate to gemini"              |

---

## Governance

Governance rules (voting thresholds, refactor gates, fitness audit, documentation governance) are in `.claude/rules/governance.md` — auto-loaded when relevant.

**Key numbers:** Fitness target ≥ 90/100. Supermajority for architecture/security. Unanimous for breaking API changes.

---

## File References

| Need To...                 | Go To                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| Find any documentation     | [docs/README.md](./docs/README.md)                                                           |
| CLI/MCP/REST API reference | [docs/ENTRYPOINTS.md](./docs/ENTRYPOINTS.md)                                                 |
| Architecture docs          | [docs/architecture/README.md](./docs/architecture/README.md)                                 |
| Development/contributing   | [docs/development/README.md](./docs/development/README.md)                                   |
| Coding standards           | [CODING_STANDARDS.md](./CODING_STANDARDS.md)                                                 |
| Research tracking          | [docs/research/RESEARCH_INDEX.md](./docs/research/RESEARCH_INDEX.md)                         |
| Context load balancing     | [docs/architecture/CONTEXT_LOAD_BALANCING.md](./docs/architecture/CONTEXT_LOAD_BALANCING.md) |
| Consensus protocols        | [docs/architecture/CONSENSUS_PROTOCOLS.md](./docs/architecture/CONSENSUS_PROTOCOLS.md)       |
| Alignment roadmap          | [docs/ALIGNMENT_ROADMAP.md](./docs/ALIGNMENT_ROADMAP.md)                                     |

### Source Code

- `packages/nexus-agents/src/core/types/index.ts` — Core type definitions
- `packages/nexus-agents/src/mcp/` — MCP server and tool implementations
- `packages/nexus-agents/src/agents/` — Agent framework

<!-- GOVERNANCE:TOOL_INDEX:START -->

## MCP Tools Reference

| Tool                | Description                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `orchestrate`       | Orchestrate a task by analyzing it, breaking it into subtasks if needed, and coordinating expert agents      |
| `create_expert`     | Create a specialized expert agent for code, architecture, security, documentation, testing, or devops tasks  |
| `execute_expert`    | Execute a task using a previously created expert agent.                                                      |
| `run_workflow`      | run_workflow tool                                                                                            |
| `consensus_vote`    | Execute multi-model consensus voting on a proposal.                                                          |
| `delegate_to_model` | Route a task to the optimal model based on capability matching. Returns model recommendation with reasoning. |
| `list_experts`      | List available expert types that can be created with create_expert.                                          |
| `list_workflows`    | List available workflow templates that can be executed with run_workflow.                                    |

_Auto-generated from source. 8 tools registered._

<!-- GOVERNANCE:TOOL_INDEX:END -->

<!-- GOVERNANCE:VERSION:START -->

_Governance Version: 2026-02-03_

<!-- GOVERNANCE:VERSION:END -->

_Last updated: 2026-02-03 (ET)_
_MCP Protocol: 2025-11-25_
_Node.js: 22.x LTS_
_TypeScript: 5.8+_
