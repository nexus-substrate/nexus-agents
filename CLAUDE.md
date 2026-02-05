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

| Variable             | Required For                        | Default                       |
| -------------------- | ----------------------------------- | ----------------------------- |
| `ANTHROPIC_API_KEY`  | Claude adapter                      | None                          |
| `OPENAI_API_KEY`     | OpenAI adapter                      | None                          |
| `GOOGLE_AI_API_KEY`  | Gemini adapter                      | None                          |
| `NEXUS_LOG_LEVEL`    | Logging verbosity                   | `info`                        |
| `NEXUS_CONFIG_PATH`  | Custom config path                  | `./nexus-agents.yaml`         |
| `NEXUS_AUTH_ENABLED` | Network auth (not needed for stdio) | `false` (stdio is local-only) |

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

### Subagent Context Management

Subagents share the same ~100k token context limit. Unmanaged, parallel agents exhaust context and lose work. Follow these guidelines:

**Scope bounding:** Each agent prompt MUST specify a bounded scope. Prefer directory-level partitions (e.g., "scan `src/consensus/`") over codebase-wide sweeps. For whole-codebase tasks, partition by top-level directory and assign one agent per partition.

**Output budgets:** Agent prompts MUST include an output constraint: "Return a prioritized summary of top-N findings. Reference files by path. Max 2000 characters." Never ask an agent to "list all" or "return everything."

**Wave execution:** Launch agents in waves of 3-4 max. Wait for each wave to complete before launching the next. This prevents the parent conversation from being flooded with simultaneous large result sets.

**Model selection:** Prefer `sonnet` or `opus` for all subagent work — they produce higher-quality analysis with fewer false positives (see Issue #770). Use `model="haiku"` only when the task is trivially mechanical (e.g., counting files, listing exports) AND cost/speed is a genuine constraint. When in doubt, use `sonnet`.

**Prompt discipline:** Agent prompts should be under 500 words. If you need more context, the task is too big for one agent — split it into smaller scoped tasks.

**Failure handling:** If an agent hits its context limit or returns truncated results, do NOT relaunch the same broad task. Instead, narrow the scope and retry on the unfinished portion only.

**Discovery reporting:** All subagent prompts should include: _"If you discover bugs or issues outside your task scope, include a `## Discoveries` section at the end of your response."_ The parent agent must process these — see [Discovered Issues](#discovered-issues--see-something-say-something).

---

## Context Budget

| Task Type          | Budget | Use For                                |
| ------------------ | ------ | -------------------------------------- |
| Minimal (quick)    | ~800   | Simple questions, file lookups         |
| Standard (feature) | ~2,500 | Feature implementation, code review    |
| Research           | ~1,500 | Documentation gathering, analysis      |
| Full (system)      | ~6,000 | System reviews, architecture decisions |

**Preservation:** Use subagents for exploration. Summarize large outputs. Reference by path instead of inlining. Start fresh conversation when switching unrelated tasks.

**Parent context protection:** When receiving results from multiple agents, summarize each result into 2-3 bullet points before proceeding. Do not inline full agent outputs into the parent conversation. If you need details, re-read the specific file rather than keeping the full result in context.

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
- [ ] Discoveries documented — did I notice any bugs or issues outside my task scope? (see [Discovered Issues](#discovered-issues--see-something-say-something))

---

## Discovered Issues — "See Something, Say Something"

When you encounter a bug, incorrect behavior, or significant gap **outside the scope of your current task**, create a GitHub issue to capture it. Do not fix it inline — document it and continue your assigned work.

### When to Create an Issue (high-confidence findings only)

- Code that will produce **wrong results** (math errors, logic bugs, division by zero)
- Missing error handling that will **cause crashes** (unguarded `.length`, null deref)
- Tests that **assert wrong behavior** (testing the bug, not the fix)
- Documentation that **directly contradicts** code behavior

### When NOT to Create a Public Issue

- Style preferences or subjective improvements
- "Could be better" observations without concrete impact
- **Security vulnerabilities** — use the [Security Discovery Protocol](#security-discovery-protocol) instead
- Anything you're not confident about — when in doubt, skip it

### Issue Template

```bash
# Check for duplicates first
gh issue list --search "{keywords}" --state open

# Create the issue
gh issue create \
  --title "{type}: {description}" \
  --label "discovered,{bug|tech-debt|test|docs}" \
  --body "$(cat <<'EOF'
**Found during:** {what task was being performed}
**Location:** `{file}:{line}`
**Description:** {1-2 sentences}
**Severity:** {critical|high|medium}
EOF
)"
```

Types: `bug:`, `tech-debt:`, `docs:`, `test:`, `perf:`, `research:`

### Subagent Discovery Protocol

Subagent prompts should include: _"If you discover bugs or issues outside your task scope, include a `## Discoveries` section at the end of your response with: file path, line number, one-sentence description, and severity."_

The parent agent MUST process subagent `## Discoveries` sections: deduplicate against open issues, then create issues for confirmed findings.

### Security Discovery Protocol

Security findings are **never** created as public GitHub issues. Instead, use a two-tier approach:

**Tier 1 — Local Security Log (ALL security findings):**

Append to `.security-discoveries.jsonl` (gitignored, never committed):

```bash
echo '{"timestamp":"'$(TZ='America/New_York' date -Iseconds)'","severity":"{critical|high|medium|low}","file":"{file}:{line}","description":"{what was found}","foundDuring":"{task}","cwe":"CWE-XXX if known"}' >> .security-discoveries.jsonl
```

This file persists across conversations so findings are never lost, even if the user isn't watching chat.

**Tier 2 — GitHub Security Advisory (critical/high only):**

For critical or high severity findings, also create a draft security advisory:

```bash
gh api repos/{owner}/{repo}/security-advisories \
  --method POST \
  -f summary="{brief description}" \
  -f description="{detailed finding}" \
  -f severity="{critical|high}" \
  -f "vulnerabilities[0][package][ecosystem]=pip" \
  -f "vulnerabilities[0][package][name]={component}"
```

Draft advisories are **private by default** — only visible to repo admins.

### Safeguards

- **Rate limit:** max 5 auto-created issues per hour
- **Duplicate check:** always search before creating
- **Security findings:** always logged to `.security-discoveries.jsonl`; critical/high also get draft GitHub security advisories

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

| Tool                      | Description                                                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `orchestrate`             | Orchestrate a task by analyzing it, breaking it into subtasks if needed, and coordinating expert agents                            |
| `create_expert`           | Create a specialized expert agent for code, architecture, security, documentation, testing, devops, or research tasks              |
| `execute_expert`          | Execute a task using a previously created expert agent. Returns the expert analysis including output, confidence, and token usage. |
| `run_workflow`            | Execute workflow templates with provided inputs, supporting built-in templates and custom paths                                    |
| `delegate_to_model`       | Route a task to the optimal model based on capability matching. Returns model recommendation with reasoning.                       |
| `list_experts`            | List available expert types that can be created with create_expert. Returns role names, descriptions, and capabilities.            |
| `list_workflows`          | List available workflow templates that can be executed with run_workflow. Returns template names and descriptions.                 |
| `consensus_vote`          | Execute multi-model consensus voting on a proposal. Uses specialized agent roles to vote with configurable strategies.             |
| `research_query`          | Query the research registry for technique status, overlaps, statistics, or text search.                                            |
| `research_add`            | Add an arXiv paper to the research registry. Fetches metadata from the arXiv API and persists to the registry.                     |
| `research_discover`       | Discover new research papers and repositories from external sources. Searches arXiv, GitHub, and other sources.                    |
| `research_analyze`        | Analyze the research registry for gaps, trends, priorities, stale entries, or coverage.                                            |
| `research_catalog_review` | Review auto-cataloged research references found during tool execution.                                                             |
| `memory_query`            | Query across all memory backends with unified results and relevance scoring.                                                       |
| `memory_stats`            | Get memory system statistics dashboard showing backend availability and metrics.                                                   |

_Auto-generated from source. 15 tools registered._

<!-- GOVERNANCE:TOOL_INDEX:END -->

<!-- GOVERNANCE:VERSION:START -->

_Governance Version: 2026-02-05.2_

<!-- GOVERNANCE:VERSION:END -->

_Last updated: 2026-02-05 (ET)_
_MCP Protocol: 2025-11-25_
_Node.js: 22.x LTS_
_TypeScript: 5.9+_
