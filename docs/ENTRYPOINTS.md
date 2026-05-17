---
title: 'Nexus-Agents Entrypoints'
description: Complete reference for all CLI commands, MCP tools, and workflow templates
tier: 1
keywords: [entrypoints, cli, mcp, api, tools, commands, reference]
---

# Nexus-Agents Entrypoints

**Last Updated:** 2026-05-12 (ET)
**Canonical Source:** This document is the single source of truth for all entrypoints.
**Issue:** #210 (Epic #209)

---

## Overview

Nexus-agents provides four interface categories:

| Interface        | Use Case                           | Transport           |
| ---------------- | ---------------------------------- | ------------------- |
| CLI Commands     | Terminal usage, CI/CD pipelines    | Process             |
| MCP Tools        | Claude Desktop, MCP clients        | JSON-RPC over stdio |
| Programmatic API | Library usage, custom applications | TypeScript import   |

---

## Quick Reference

Most commonly used commands:

| Command                        | Description                          |
| ------------------------------ | ------------------------------------ |
| `nexus-agents doctor`          | Check system health and dependencies |
| `nexus-agents setup`           | Configure Claude CLI integration     |
| `nexus-agents orchestrate`     | Run task with agent coordination     |
| `nexus-agents review <url>`    | Review a GitHub PR                   |
| `nexus-agents vote --proposal` | Multi-agent consensus voting         |
| `nexus-agents workflow run`    | Execute predefined workflow          |
| `nexus-agents expert list`     | List available expert types          |
| `nexus-agents routing-audit`   | Debug model routing decisions        |
| `nexus-agents --help`          | Show all available commands          |

---

## CLI Commands

**Entry Point:** `nexus-agents [command] [options]`

| Command                | Subcommand                    | Description                                                                                                                                                                             | Mode         |
| ---------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `(default)`            | -                             | Start MCP server                                                                                                                                                                        | server       |
| `--help`               | -                             | Display help text                                                                                                                                                                       | any          |
| `--version`            | -                             | Display version                                                                                                                                                                         | any          |
| `doctor`               | -                             | Check CLI health and dependencies                                                                                                                                                       | any          |
| `config`               | `init`                        | Generate starter configuration file                                                                                                                                                     | any          |
| `expert`               | `list`                        | List available experts (built-in + custom)                                                                                                                                              | any          |
| `workflow`             | `list`                        | List available workflow templates                                                                                                                                                       | any          |
| `workflow`             | `run <name>`                  | Execute a workflow template                                                                                                                                                             | orchestrator |
| `server`               | -                             | Start MCP server (explicit)                                                                                                                                                             | server       |
| `server`               | `--interactive`               | Start interactive REPL mode                                                                                                                                                             | server       |
| `review`               | `<url>`                       | Review a GitHub PR                                                                                                                                                                      | orchestrator |
| `routing-audit`        | `<task>`                      | Debug routing decisions (dry-run)                                                                                                                                                       | any          |
| `orchestrate`          | `<task>`                      | Execute task standalone                                                                                                                                                                 | orchestrator |
| `system-review`        | -                             | Run 5-phase system review                                                                                                                                                               | any          |
| `vote`                 | `--proposal`                  | Consensus voting with 6 agents                                                                                                                                                          | any          |
| `research`             | `status`                      | Show technique implementation status                                                                                                                                                    | any          |
| `research`             | `overlap`                     | Find overlapping techniques                                                                                                                                                             | any          |
| `research`             | `add`                         | Add new paper from arXiv                                                                                                                                                                | any          |
| `research`             | `discover`                    | Discover papers/repos from external sources                                                                                                                                             | any          |
| `research`             | `review`                      | Discover, score, and rank research findings                                                                                                                                             | any          |
| `research`             | `prioritize`                  | Rank actionable techniques by priority                                                                                                                                                  | any          |
| `verify`               | -                             | Quick verification check                                                                                                                                                                | any          |
| `review-demo`          | -                             | PR review demo with wizard UX                                                                                                                                                           | orchestrator |
| `validation-dashboard` | -                             | A/B testing and validation dashboard                                                                                                                                                    | any          |
| `swe-bench`            | `run` / `evaluate` / `status` | **Deprecated** — harness extracted to [`nexus-eval-swebench`](https://github.com/nexus-substrate/nexus-eval-swebench) (epic #2514). In-tree commands stub out with a migration message. | any          |
| `setup`                | -                             | Configure Claude CLI integration                                                                                                                                                        | any          |
| `learning-metrics`     | -                             | Show learning metrics dashboard                                                                                                                                                         | any          |
| `index`                | `generate`                    | Generate codebase index                                                                                                                                                                 | any          |
| `index`                | `check`                       | Validate index freshness                                                                                                                                                                | any          |
| `index`                | `diagram`                     | Generate Mermaid dependency diagram                                                                                                                                                     | any          |
| `hooks`                | `session-start`               | Handle SessionStart hook events                                                                                                                                                         | any          |
| `hooks`                | `session-end`                 | Handle SessionEnd hook events                                                                                                                                                           | any          |
| `hooks`                | `pre-tool`                    | Handle PreToolUse hook events                                                                                                                                                           | any          |
| `hooks`                | `post-tool`                   | Handle PostToolUse hook events                                                                                                                                                          | any          |
| `hooks`                | `stop`                        | Handle Stop hook events                                                                                                                                                                 | any          |
| `init`                 | `--portable`                  | Bootstrap workspace-local `.nexus-agents/`                                                                                                                                              | any          |
| `init`                 | `--portable --mcp-config`     | …and emit `.mcp.json` for Claude Code                                                                                                                                                   | any          |
| `init`                 | `--portable --install`        | …and install nexus-agents into `cli/` + bin shim                                                                                                                                        | any          |
| `init`                 | `--portable --uninstall`      | Remove portable install (preserves data dir)                                                                                                                                            | any          |

### Mode Selection

| Mode           | Flag                  | Description                             |
| -------------- | --------------------- | --------------------------------------- |
| `server`       | `--mode=server`       | MCP server for Claude Desktop (default) |
| `orchestrator` | `--mode=orchestrator` | Standalone CLI, CI/CD pipelines         |
| `mesh`         | `--mode=mesh`         | Planned — not yet implemented           |

### Global Options

Options available for all commands:

| Option            | Type    | Default  | Description              |
| ----------------- | ------- | -------- | ------------------------ |
| `-h`, `--help`    | boolean | -        | Show help message        |
| `-v`, `--version` | boolean | -        | Show version information |
| `--verbose`       | boolean | `false`  | Enable verbose output    |
| `-m`, `--mode`    | enum    | `server` | Server mode (see above)  |

### Command Options Reference

#### orchestrate

| Option           | Type    | Default  | Description                             |
| ---------------- | ------- | -------- | --------------------------------------- |
| `--model`        | enum    | auto     | CLI to use: `claude`, `gemini`, `codex` |
| `--format`       | enum    | `text`   | Output format: `text`, `json`           |
| `--dry-run`      | boolean | `false`  | Show routing decision without executing |
| `--max-tokens`   | number  | `100000` | Maximum token budget                    |
| `--max-cost-usd` | number  | `10`     | Maximum cost budget in USD              |

#### vote

| Option              | Type    | Default    | Description                                         |
| ------------------- | ------- | ---------- | --------------------------------------------------- |
| `-p`, `--proposal`  | string  | required   | Proposal text to vote on                            |
| `-t`, `--threshold` | enum    | `majority` | Threshold: `majority`, `supermajority`, `unanimous` |
| `--timeout`         | number  | `90`       | Timeout per vote in seconds                         |
| `--quick`           | boolean | `false`    | Use 3 agents instead of 6                           |
| `--dry-run`         | boolean | `false`    | Simulate votes without agent execution              |

#### review

| Option          | Type    | Default | Description                      |
| --------------- | ------- | ------- | -------------------------------- |
| `--setup`       | boolean | `false` | Run setup wizard                 |
| `--dry-run`     | boolean | `false` | Review without posting to GitHub |
| `--skip-checks` | boolean | `false` | Skip pre-flight validation       |

#### setup

| Option              | Type    | Default | Description                         |
| ------------------- | ------- | ------- | ----------------------------------- |
| `--interactive`     | boolean | `true`  | Run interactive setup wizard        |
| `--non-interactive` | boolean | `false` | Skip prompts (for CI/automation)    |
| `--force`           | boolean | `false` | Overwrite existing files            |
| `--skip-mcp`        | boolean | `false` | Skip MCP configuration              |
| `--skip-rules`      | boolean | `false` | Skip rules file generation          |
| `--skip-hooks`      | boolean | `false` | Skip hook configuration             |
| `--scope`           | enum    | `user`  | MCP config scope: `user`, `project` |
| `--dry-run`         | boolean | `false` | Show changes without making them    |

#### routing-audit

| Option           | Type    | Default | Description                    |
| ---------------- | ------- | ------- | ------------------------------ |
| `--format`       | enum    | `table` | Output format: `table`, `json` |
| `--dry-run`      | boolean | `false` | Use deterministic TOPSIS-only  |
| `--bandit-stats` | boolean | `false` | Show LinUCB bandit statistics  |

#### system-review

| Option           | Type    | Default | Description                      |
| ---------------- | ------- | ------- | -------------------------------- |
| `--create-issue` | boolean | `false` | Create GitHub issue with results |
| `--fix`          | boolean | `false` | Auto-fix correctable issues      |

#### learning-metrics

| Option           | Type    | Default | Description                      |
| ---------------- | ------- | ------- | -------------------------------- |
| `--period`       | number  | `24`    | Time period in hours             |
| `--format`       | enum    | `ascii` | Output format: `ascii`, `json`   |
| `--bandit-stats` | boolean | `false` | Include LinUCB bandit statistics |

#### research

| Option           | Type   | Default | Description                    |
| ---------------- | ------ | ------- | ------------------------------ |
| `--format`       | enum   | `table` | Output format: `table`, `json` |
| `-o`, `--output` | string | -       | Custom output path for refresh |

#### index

| Option           | Type   | Default | Description                   |
| ---------------- | ------ | ------- | ----------------------------- |
| `--format`       | enum   | `yaml`  | Output format: `yaml`, `json` |
| `-o`, `--output` | string | -       | Custom output path            |

### Usage Examples

```bash
# Start MCP server (default)
nexus-agents

# Health check
nexus-agents doctor

# Generate config
nexus-agents config init

# List experts
nexus-agents expert list

# Run workflow
nexus-agents workflow run code-review --input='{"url": "..."}'

# Review PR
nexus-agents review https://github.com/owner/repo/pull/123

# Debug routing
nexus-agents routing-audit "Implement a sorting algorithm" --format=json

# Standalone orchestration
nexus-agents orchestrate "Review this code for security issues"

# Consensus voting
nexus-agents vote --proposal "Should we adopt TypeScript 6.0?"

# System review (5-phase checklist)
nexus-agents system-review
nexus-agents system-review --create-issue
nexus-agents system-review --fix --verbose

# Research registry
nexus-agents research status                       # Show all techniques
nexus-agents research status --status=implemented  # Filter by status
nexus-agents research status aegean-consensus      # Show specific technique
nexus-agents research overlap trinity-roles        # Find related techniques
nexus-agents research add 2501.06322 --dry-run     # Preview adding paper
nexus-agents research discover --topic=orchestration                # Discover from all sources
nexus-agents research discover --topic=agents --source=github       # GitHub repos only
nexus-agents research discover --topic=agents --source=semantic_scholar  # Semantic Scholar
nexus-agents research discover --topic=agents --source=papers_with_code  # Papers with Code
nexus-agents research review --topic=orchestration                  # Discover, score, rank findings
nexus-agents research review --topic=agents --create-issues         # Auto-create GitHub issues
nexus-agents research prioritize                                    # Show priority backlog
nexus-agents research prioritize --topic=consensus                  # Filter by topic

# Quick verification
nexus-agents verify

# PR review demo with wizard
nexus-agents review-demo

# Validation dashboard
nexus-agents validation-dashboard

# SWE-bench evaluation — DEPRECATED, see https://github.com/nexus-substrate/nexus-eval-swebench
# (the in-tree commands stub out with a migration message; harness lives in its own repo per #2514)

# Setup Claude CLI integration
nexus-agents setup                    # Auto-configure MCP + hooks + rules
nexus-agents setup --dry-run          # Preview what would be done
nexus-agents setup --skip-hooks       # Skip hook configuration

# Learning metrics dashboard
nexus-agents learning-metrics
nexus-agents learning-metrics --period=48
nexus-agents learning-metrics --bandit-stats --format=json

# Codebase index
nexus-agents index generate
nexus-agents index check
nexus-agents index diagram

# Claude CLI hooks (called by Claude Code, not user)
nexus-agents hooks session-start
nexus-agents hooks pre-tool --tool Bash --validate
nexus-agents hooks post-tool --track-metrics
nexus-agents hooks stop --check-tasks
```

### Source Files

| File                                      | Purpose               |
| ----------------------------------------- | --------------------- |
| `src/cli-commands.ts`                     | Command dispatcher    |
| `src/cli/doctor.ts`                       | Doctor command        |
| `src/cli/config-init.ts`                  | Config init command   |
| `src/cli/expert-list.ts`                  | Expert list command   |
| `src/cli/workflow-run.ts`                 | Workflow commands     |
| `src/cli/review-command.ts`               | PR review command     |
| `src/cli/routing-audit.ts`                | Routing audit command |
| `src/cli/orchestrate-command.ts`          | Orchestrate command   |
| `src/cli/system-review.ts`                | System review command |
| `src/cli/verify-command.ts`               | Verify command        |
| `src/cli/review-demo-command.ts`          | Review demo command   |
| `src/cli/validation-dashboard-command.ts` | Validation dashboard  |
| `src/cli/swe-bench-command.ts`            | SWE-bench command     |
| `src/cli/research-command.ts`             | Research registry CLI |
| `src/cli/setup-command.ts`                | Setup command         |
| `src/cli/learning-metrics-command.ts`     | Learning metrics      |
| `src/cli/index-command.ts`                | Index command         |
| `src/cli/hooks/index.ts`                  | Hooks command         |

---

## MCP Tools

**Protocol:** Model Context Protocol (2025-11-25)
**Transport:** JSON-RPC 2.0 over stdio

| Tool                          | Description                                                                                                    | Auth         | Rate Limit    |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------ | ------------- |
| `orchestrate`                 | Task orchestration with Orchestrator coordination                                                              | None (local) | Shared bucket |
| `create_expert`               | Dynamic expert agent creation                                                                                  | None (local) | Shared bucket |
| `execute_expert`              | Execute a task using a created expert agent                                                                    | None (local) | Shared bucket |
| `run_workflow`                | Execute workflow template                                                                                      | None (local) | Shared bucket |
| `delegate_to_model`           | Route task to optimal model                                                                                    | None (local) | Shared bucket |
| `consensus_vote`              | Multi-model consensus voting on proposals                                                                      | None (local) | Shared bucket |
| `list_experts`                | List available expert types for discoverability                                                                | None (local) | Shared bucket |
| `list_workflows`              | List available workflow templates                                                                              | None (local) | Shared bucket |
| `research_query`              | Query research registry (status, overlap, stats, search)                                                       | None (local) | Shared bucket |
| `research_add`                | Add paper to registry by arXiv ID                                                                              | None (local) | Shared bucket |
| `research_discover`           | Discover papers/repos from external sources                                                                    | None (local) | Shared bucket |
| `research_analyze`            | Analyze registry for gaps, trends, coverage                                                                    | None (local) | Shared bucket |
| `research_add_source`         | Add non-paper source (repo, tool, blog) with quality scoring                                                   | None (local) | Shared bucket |
| `research_catalog_review`     | Review auto-cataloged research references                                                                      | None (local) | Shared bucket |
| `research_synthesize`         | Synthesize registry into quality-aware topic clusters                                                          | None (local) | Shared bucket |
| `memory_query`                | Query across all memory backends with unified results                                                          | None (local) | Shared bucket |
| `memory_stats`                | Memory system statistics dashboard                                                                             | None (local) | Shared bucket |
| `issue_triage`                | Triage GitHub issue using full security pipeline                                                               | None (local) | Shared bucket |
| `run_graph_workflow`          | Execute predefined graph workflow with checkpointing                                                           | None (local) | Shared bucket |
| `weather_report`              | Multi-CLI performance weather report                                                                           | None (local) | Shared bucket |
| `execute_spec`                | Execute AI software factory spec pipeline                                                                      | None (local) | Shared bucket |
| `memory_write`                | Write a memory entry to a specific backend                                                                     | None (local) | Shared bucket |
| `registry_import`             | Generate draft model registry entry                                                                            | None (local) | Shared bucket |
| `query_trace`                 | Query execution traces by run ID                                                                               | None (local) | Shared bucket |
| `query_task_state`            | Query structured task-state log (incl. Magentic-One ledgers)                                                   | None (local) | Shared bucket |
| `verify_audit_chain`          | Verify hash chain of a FileAuditStorage audit log directory                                                    | None (local) | Shared bucket |
| `run_pipeline`                | Run a typed pipeline by name with provided inputs                                                              | None (local) | Shared bucket |
| `repo_analyze`                | Analyze GitHub repository structure                                                                            | None (local) | Shared bucket |
| `repo_security_plan`          | Generate security scanning pipeline for a repository                                                           | None (local) | Shared bucket |
| `extract_symbols`             | Extract code symbols (functions, classes, types) from source files                                             | None (local) | Shared bucket |
| `search_codebase`             | Search codebase for code patterns, symbols, or text                                                            | None (local) | Shared bucket |
| `run_dev_pipeline`            | Multi-agent dev pipeline: research→plan→vote→implement→QA→security                                             | Optional     | Shared bucket |
| `pr_review`                   | Multi-voter PR review with verification gate (experimental)                                                    | None (local) | Shared bucket |
| `supply_chain_tradeoff_panel` | Per-axis tradeoff vote for build-vs-buy / supply-chain decisions                                               | None (local) | Shared bucket |
| `compare_data_feeds`          | Diff two YAML/JSON feeds: coverage + per-field axes                                                            | None (local) | Shared bucket |
| `survey_oss_landscape`        | Transient OSS project search (license, stars, last-commit) via GitHub                                          | None (local) | Shared bucket |
| `vendor_publishing_audit`     | Look up a vendor's signing infrastructure (GPG keys, URL patterns)                                             | None (local) | Shared bucket |
| `improvement_review`          | Threshold-gated observability loop — surfaces routing/tech-debt/bug/security signals from outcome+fitness data | None (local) | Shared bucket |

**Rate limiting:** All tools share a single token bucket rate limiter (capacity: 100 tokens, refill: 10 tokens/sec). Each tool call consumes one token.

### Tool Schemas

#### orchestrate

```json
{
  "name": "orchestrate",
  "description": "Orchestrate a complex task using specialized expert agents",
  "inputSchema": {
    "type": "object",
    "properties": {
      "task": { "type": "string", "description": "Task description" },
      "context": { "type": "object", "description": "Optional context" },
      "maxIterations": { "type": "number", "default": 3 }
    },
    "required": ["task"]
  }
}
```

#### create_expert

```json
{
  "name": "create_expert",
  "description": "Create a specialized expert agent",
  "inputSchema": {
    "type": "object",
    "properties": {
      "role": {
        "type": "string",
        "enum": [
          "code_expert",
          "architecture_expert",
          "security_expert",
          "documentation_expert",
          "testing_expert",
          "devops_expert",
          "research_expert",
          "pm_expert",
          "ux_expert",
          "infrastructure_expert"
        ]
      },
      "modelPreference": { "type": "string", "description": "Preferred model tier" }
    },
    "required": ["role"]
  }
}
```

#### run_workflow

```json
{
  "name": "run_workflow",
  "description": "Execute a predefined workflow template",
  "inputSchema": {
    "type": "object",
    "properties": {
      "template": { "type": "string", "description": "Workflow template name" },
      "inputs": { "type": "object", "description": "Workflow inputs" },
      "dryRun": { "type": "boolean", "default": false }
    },
    "required": ["template"]
  }
}
```

#### delegate_to_model

```json
{
  "name": "delegate_to_model",
  "description": "Route a task to the optimal model based on capabilities",
  "inputSchema": {
    "type": "object",
    "properties": {
      "task": { "type": "string", "description": "Task description" },
      "preferredCapability": { "type": "string", "enum": ["reasoning", "code", "speed", "cost"] }
    },
    "required": ["task"]
  }
}
```

#### list_experts

```json
{
  "name": "list_experts",
  "description": "List available expert types that can be created with create_expert",
  "inputSchema": {
    "type": "object",
    "properties": {
      "format": { "type": "string", "enum": ["full", "names"], "default": "full" }
    }
  }
}
```

#### list_workflows

```json
{
  "name": "list_workflows",
  "description": "List available workflow templates that can be executed with run_workflow",
  "inputSchema": {
    "type": "object",
    "properties": {
      "category": { "type": "string", "description": "Filter by category" },
      "format": { "type": "string", "enum": ["full", "names"], "default": "full" }
    }
  }
}
```

#### execute_expert

```json
{
  "name": "execute_expert",
  "description": "Execute a task using a previously created expert agent",
  "inputSchema": {
    "type": "object",
    "properties": {
      "expertId": { "type": "string", "description": "Expert ID from create_expert tool" },
      "task": { "type": "string", "description": "Task description for the expert to execute" },
      "context": { "type": "object", "description": "Additional context metadata" }
    },
    "required": ["expertId", "task"]
  }
}
```

#### consensus_vote

```json
{
  "name": "consensus_vote",
  "description": "Execute multi-model consensus voting on a proposal",
  "inputSchema": {
    "type": "object",
    "properties": {
      "proposal": { "type": "string", "description": "Proposal text to vote on" },
      "threshold": {
        "type": "string",
        "enum": ["majority", "supermajority", "unanimous"],
        "description": "Legacy threshold (use strategy instead)"
      },
      "strategy": {
        "type": "string",
        "enum": [
          "simple_majority",
          "supermajority",
          "unanimous",
          "proof_of_learning",
          "higher_order"
        ]
      },
      "quickMode": {
        "type": "boolean",
        "default": false,
        "description": "Use 3 agents instead of 5"
      },
      "simulateVotes": {
        "type": "boolean",
        "default": false,
        "description": "TESTS ONLY — random output, must not be used for real decisions"
      }
    },
    "required": ["proposal"]
  }
}
```

#### research_query

```json
{
  "name": "research_query",
  "description": "Query the research registry for technique status, overlaps, statistics, or text search",
  "inputSchema": {
    "type": "object",
    "properties": {
      "action": { "type": "string", "enum": ["status", "overlap", "stats", "search"] },
      "techniqueId": { "type": "string", "description": "Technique ID for status/overlap queries" },
      "query": { "type": "string", "description": "Search query string for search action" },
      "status": {
        "type": "string",
        "enum": ["implemented", "planned", "not-started", "rejected", "all"],
        "default": "all"
      },
      "threshold": { "type": "number", "description": "Overlap threshold (0-1) for overlap action" }
    },
    "required": ["action"]
  }
}
```

#### research_add

```json
{
  "name": "research_add",
  "description": "Add an arXiv paper to the research registry",
  "inputSchema": {
    "type": "object",
    "properties": {
      "arxivId": {
        "type": "string",
        "pattern": "^\\d{4}\\.\\d{4,5}$",
        "description": "arXiv paper ID (e.g., \"2401.12345\")"
      },
      "topic": { "type": "string", "description": "Research topic to categorize the paper under" },
      "priority": { "type": "string", "enum": ["P1", "P2", "P3", "P4"] },
      "dryRun": { "type": "boolean", "default": false, "description": "Preview without persisting" }
    },
    "required": ["arxivId"]
  }
}
```

#### research_discover

```json
{
  "name": "research_discover",
  "description": "Discover new research papers and repositories from external sources",
  "inputSchema": {
    "type": "object",
    "properties": {
      "topic": { "type": "string", "description": "Research topic to search for" },
      "source": {
        "type": "string",
        "enum": [
          "arxiv",
          "github",
          "google_ai",
          "meta_fair",
          "microsoft",
          "deepmind",
          "semantic_scholar",
          "papers_with_code",
          "openalex",
          "all"
        ]
      },
      "maxResults": { "type": "number", "description": "Max results (1-20)" },
      "sinceDate": { "type": "string", "description": "Only results after this date (YYYY-MM-DD)" },
      "relevanceThreshold": { "type": "number", "description": "Minimum relevance score (0-1)" }
    },
    "required": ["topic"]
  }
}
```

#### research_analyze

```json
{
  "name": "research_analyze",
  "description": "Analyze the research registry for gaps, trends, priorities, stale entries, or coverage",
  "inputSchema": {
    "type": "object",
    "properties": {
      "focus": { "type": "string", "enum": ["gaps", "trends", "priorities", "stale", "coverage"] },
      "topic": { "type": "string", "description": "Optional topic filter" }
    },
    "required": ["focus"]
  }
}
```

#### research_catalog_review

```json
{
  "name": "research_catalog_review",
  "description": "Review auto-cataloged research references found during tool execution",
  "inputSchema": {
    "type": "object",
    "properties": {
      "action": { "type": "string", "enum": ["list", "approve", "dismiss", "flush"] },
      "identifier": { "type": "string", "description": "Reference identifier for approve/dismiss" },
      "topic": { "type": "string", "description": "Topic for approved papers" },
      "createIssue": {
        "type": "boolean",
        "default": false,
        "description": "Create GitHub issue when approving"
      }
    },
    "required": ["action"]
  }
}
```

#### memory_query

```json
{
  "name": "memory_query",
  "description": "Query across all memory backends with unified results",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "Search query to match against memory contents" },
      "limit": { "type": "number", "default": 10, "description": "Maximum results (1-50)" },
      "source": {
        "type": "string",
        "enum": ["session", "belief", "agentic", "typed", "all"],
        "default": "all"
      }
    },
    "required": ["query"]
  }
}
```

#### memory_stats

```json
{
  "name": "memory_stats",
  "description": "Memory system statistics dashboard",
  "inputSchema": {
    "type": "object",
    "properties": {
      "includeDecay": {
        "type": "boolean",
        "default": true,
        "description": "Include decay statistics"
      },
      "includePromotion": {
        "type": "boolean",
        "default": true,
        "description": "Include promotion pipeline stats"
      }
    }
  }
}
```

#### issue_triage

```json
{
  "name": "issue_triage",
  "description": "Triage a GitHub issue using the full security pipeline",
  "inputSchema": {
    "type": "object",
    "properties": {
      "issueUrl": {
        "type": "string",
        "description": "GitHub issue URL (e.g., https://github.com/owner/repo/issues/123)"
      },
      "dryRun": {
        "type": "boolean",
        "default": true,
        "description": "If true, returns proposed actions without executing them"
      }
    },
    "required": ["issueUrl"]
  }
}
```

#### run_graph_workflow

```json
{
  "name": "run_graph_workflow",
  "description": "Execute a predefined graph-based workflow with checkpointing, event streaming, and audit trail support",
  "inputSchema": {
    "type": "object",
    "properties": {
      "workflow": {
        "type": "string",
        "description": "Workflow name: echo, pipeline, code-review, security-scan"
      },
      "inputs": {
        "type": "object",
        "description": "Input values for the workflow"
      },
      "enableCheckpointing": {
        "type": "boolean",
        "default": true,
        "description": "Enable checkpoint saving between steps"
      },
      "enableAuditTrail": {
        "type": "boolean",
        "default": false,
        "description": "Enable audit trail event logging"
      }
    },
    "required": ["workflow"]
  }
}
```

#### weather_report

```json
{
  "name": "weather_report",
  "description": "Get multi-CLI performance weather report with per-CLI success rates and adaptive routing bonuses",
  "inputSchema": {
    "type": "object",
    "properties": {
      "cli": {
        "type": "string",
        "enum": ["claude", "gemini", "codex"],
        "description": "Filter by CLI"
      },
      "category": {
        "type": "string",
        "enum": [
          "architecture",
          "code_generation",
          "code_review",
          "research",
          "security_review",
          "planning",
          "documentation",
          "testing",
          "devops",
          "exploration"
        ]
      },
      "includeAdaptive": {
        "type": "boolean",
        "default": true,
        "description": "Include adaptive routing bonuses"
      }
    }
  }
}
```

#### execute_spec

```json
{
  "name": "execute_spec",
  "description": "Execute an AI software factory spec through the full pipeline (parse, decompose, compile, execute, validate)",
  "inputSchema": {
    "type": "object",
    "properties": {
      "spec": { "type": "string", "description": "Spec content in markdown format" },
      "dryRun": { "type": "boolean", "default": false, "description": "Validate without executing" }
    },
    "required": ["spec"]
  }
}
```

#### registry_import

```json
{
  "name": "registry_import",
  "description": "Add an AI model to the registry. Generates a draft ModelCapability entry with conservative quality scores for human review",
  "inputSchema": {
    "type": "object",
    "properties": {
      "provider": {
        "type": "string",
        "enum": ["anthropic", "google", "openai"],
        "description": "Model provider"
      },
      "modelId": { "type": "string", "description": "Provider model identifier" },
      "dryRun": { "type": "boolean", "default": true, "description": "Preview without persisting" }
    },
    "required": ["provider", "modelId"]
  }
}
```

#### compare_data_feeds

```json
{
  "name": "compare_data_feeds",
  "description": "Diff two YAML/JSON feeds: coverage (entries only-in-A, only-in-B, in-both) and per-field differences for shared entries",
  "inputSchema": {
    "type": "object",
    "properties": {
      "feedAPath": {
        "type": "string",
        "description": "Filesystem path to feed A (YAML or JSON, auto-detected by extension)"
      },
      "feedBPath": { "type": "string", "description": "Filesystem path to feed B" },
      "keyPath": {
        "type": "string",
        "description": "Dotted path to the entry key, e.g. \"id\" or \"name\". Each entry must have this field."
      },
      "compareFields": {
        "type": "array",
        "items": { "type": "string" },
        "maxItems": 20,
        "description": "Optional dotted field paths to compare across matched entries (e.g. [\"license\", \"sha256\"])"
      }
    },
    "required": ["feedAPath", "feedBPath", "keyPath"]
  }
}
```

#### survey_oss_landscape

```json
{
  "name": "survey_oss_landscape",
  "description": "Transient OSS project search via GitHub (license, stars, last-commit). Returns ranked candidates for build-vs-buy decisions",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Free-text search query, e.g. \"cargo nextest replacement\" or \"OSS SBOM tools\""
      },
      "maxResults": {
        "type": "number",
        "minimum": 1,
        "maximum": 50,
        "default": 10,
        "description": "Maximum candidates to return (1-50)"
      },
      "minStars": {
        "type": "number",
        "minimum": 0,
        "default": 0,
        "description": "Minimum star count to include (useful for filtering noise)"
      }
    },
    "required": ["query"]
  }
}
```

#### vendor_publishing_audit

```json
{
  "name": "vendor_publishing_audit",
  "description": "Look up a vendor's signing infrastructure (GPG keys, URL patterns, signature shape). Reads from a bundled seed of known vendors",
  "inputSchema": {
    "type": "object",
    "properties": {
      "vendor": {
        "type": "string",
        "description": "Vendor identifier, lowercase. e.g. \"ubuntu\", \"debian\", \"fedora\""
      }
    },
    "required": ["vendor"]
  }
}
```

Response distinguishes `known: true` (full publishing entry) from `known: false` (lists the available vendor ids).

#### improvement_review

```json
{
  "name": "improvement_review",
  "description": "Threshold-gated observability loop. Surfaces routing / tech-debt / bug / security signals from outcome + fitness data; optionally files candidate issues",
  "inputSchema": {
    "type": "object",
    "properties": {
      "lookbackDays": {
        "type": "number",
        "minimum": 1,
        "maximum": 90,
        "default": 7,
        "description": "Lookback window for outcome data, in days"
      },
      "fileIssues": {
        "type": "boolean",
        "default": false,
        "description": "When true, file candidate issues via `gh issue create` for crossed thresholds (rate-limited to 5/run, deduped against open issues). When false, return signals only."
      },
      "minSampleSize": {
        "type": "number",
        "minimum": 1,
        "maximum": 1000,
        "default": 5,
        "description": "Minimum sample size before a CLI/category signal can fire"
      },
      "fitnessFloor": {
        "type": "number",
        "minimum": 0,
        "maximum": 100,
        "default": 90,
        "description": "Minimum fitness score before a fitness signal fires"
      }
    }
  }
}
```

### Built-in Workflow Templates

11 built-in templates are available (source: `src/workflows/template-types.ts`):

| Template                 | Category       | Keywords                                                        |
| ------------------------ | -------------- | --------------------------------------------------------------- |
| `code-review`            | review         | review, quality, security, analysis, code                       |
| `docs-audit`             | documentation  | docs, audit, verify, accuracy, drift, documentation, fact-check |
| `feature-implementation` | development    | feature, implement, develop, create, build                      |
| `bug-fix`                | development    | bug, fix, debug, error, issue, patch                            |
| `documentation-update`   | documentation  | docs, documentation, readme, api, update                        |
| `infrastructure-audit`   | infrastructure | infrastructure, hardware, server, idrac, ipmi, bare-metal       |
| `refactoring`            | development    | refactor, clean, improve, restructure, simplify                 |
| `research-review`        | review         | research, paper, arxiv, discover, catalog, registry             |
| `security-audit`         | review         | security, audit, vulnerability, owasp, scan                     |
| `standards-review`       | review         | standards, lint, typecheck, fitness, compliance                 |
| `test-generation`        | testing        | test, generate, coverage, unit, integration                     |

### Source Files

| File                                       | Purpose                |
| ------------------------------------------ | ---------------------- |
| `src/mcp/tools/index.ts`                   | Tool registration      |
| `src/mcp/tools/orchestrate.ts`             | Orchestrate tool       |
| `src/mcp/tools/create-expert.ts`           | Create expert tool     |
| `src/mcp/tools/run-workflow.ts`            | Run workflow tool      |
| `src/mcp/tools/delegate-to-model.ts`       | Delegate tool          |
| `src/mcp/tools/list-experts.ts`            | List experts tool      |
| `src/mcp/tools/list-workflows.ts`          | List workflows tool    |
| `src/mcp/tools/research-query.ts`          | Research query tool    |
| `src/mcp/tools/research-add.ts`            | Research add tool      |
| `src/mcp/tools/research-discover.ts`       | Research discover tool |
| `src/mcp/tools/research-analyze.ts`        | Research analyze tool  |
| `src/mcp/tools/research-catalog-review.ts` | Catalog review tool    |
| `src/mcp/tools/research-auto-catalog.ts`   | Auto-catalog module    |
| `src/mcp/tools/execute-expert.ts`          | Execute expert tool    |
| `src/mcp/tools/consensus-vote.ts`          | Consensus vote tool    |
| `src/mcp/tools/consensus-vote-types.ts`    | Consensus vote schemas |
| `src/mcp/tools/memory-query.ts`            | Memory query tool      |
| `src/mcp/tools/memory-stats.ts`            | Memory stats tool      |
| `src/mcp/tools/weather-report.ts`          | Weather report tool    |
| `src/mcp/tools/issue-triage.ts`            | Issue triage tool      |
| `src/mcp/tools/run-graph-workflow.ts`      | Graph workflow tool    |
| `src/mcp/tools/execute-spec.ts`            | Execute spec tool      |
| `src/mcp/tools/registry-import.ts`         | Registry import tool   |

---

## Programmatic API

**Package:** `nexus-agents`
**Entry Point:** `import { ... } from 'nexus-agents'`

### Core Exports

```typescript
// Result Pattern
import { ok, err, isOk, isErr, map, mapErr, unwrap } from 'nexus-agents';

// Errors
import {
  NexusError,
  ValidationError,
  ConfigError,
  ModelError,
  AgentError,
  WorkflowError,
  SecurityError,
  TimeoutError,
} from 'nexus-agents';

// Configuration
import { AppConfigSchema, defaultConfig, type AppConfig } from 'nexus-agents';
```

### Model Adapters

```typescript
import {
  // Factory functions
  createClaudeAdapter,
  createOpenAIAdapter,
  createGeminiAdapter,
  createOllamaAdapter,
  AdapterFactory,

  // Classes
  ClaudeAdapter,
  OpenAIAdapter,
  GeminiAdapter,
  OllamaAdapter,

  // Types
  type IModelAdapter,
  type CompletionRequest,
  type CompletionResponse,
} from 'nexus-agents';
```

### Agents & Experts

```typescript
import {
  // Core agents
  Orchestrator, // preferred (TechLead still available as deprecated alias)
  Expert,
  ExpertFactory,

  // Built-in experts
  CodeExpert,
  SecurityExpert,
  ArchitectureExpert,
  TestingExpert,
  DocumentationExpert,

  // Selection utilities
  selectExperts,
  analyzeTask,

  // Types
  type Task,
  type TaskResult,
  type ExecutionPlan,
} from 'nexus-agents';
```

### Workflows

```typescript
import {
  // Parsing
  parseWorkflowYaml,
  loadWorkflowFile,
  validateWorkflow,

  // Templates
  BUILT_IN_TEMPLATES,
  createTemplateRegistry,

  // Types
  type WorkflowDefinition,
  type WorkflowStep,
  type WorkflowResult,
} from 'nexus-agents';
```

### MCP Server

```typescript
import {
  // Server creation
  createServer,
  startStdioServer,

  // Tool registration
  registerTools,
  registerOrchestrateTool,
  registerCreateExpertTool,
  registerRunWorkflowTool,

  // Types
  type ServerConfig,
  type ServerInstance,
} from 'nexus-agents';
```

### CLI Adapters

```typescript
import {
  // Adapter creation
  createCliAdapter,
  createAllAdapters,
  getAvailableClis,

  // Adapter classes
  ClaudeCliAdapter,
  GeminiCliAdapter,
  CodexCliAdapter,

  // Routing
  CompositeRouter,
  createCompositeRouter,

  // Detection
  CliDetectionCache,
  createCliDetectionCache,

  // Types
  type ICliAdapter,
  type CliTask,
  type CliResponse,
} from 'nexus-agents';
```

### Context & Memory

```typescript
import {
  // Token counting
  TokenCounter,
  createTokenCounter,

  // Context management
  ContextManager,

  // Types
  type ITokenCounter,
  type TokenCountResult,
} from 'nexus-agents';
```

### Observability

```typescript
import {
  // Orchestration observation (renamed from SwarmObserver in v2.24)
  OrchestrationObserver,
  createOrchestrationObserver,

  // Audit logging
  AuditLogger,
  createAuditLogger,

  // Types
  type IOrchestrationObserver,
  type IAuditLogger,
} from 'nexus-agents';
```

### Learning & Feedback

```typescript
import {
  // Feedback collection
  OutcomeFeedbackCollector,
  createOutcomeFeedbackCollector,

  // Integration
  FeedbackIntegration,
  createFeedbackIntegration,

  // Utilities
  computeOutcomeReward,

  // Types
  type TaskOutcome,
  type ComputedReward,
} from 'nexus-agents';
```

### Quick Start Examples

#### MCP Server Mode

```typescript
import { startStdioServer } from 'nexus-agents';

await startStdioServer({
  name: 'my-server',
  version: '1.0.0',
});
```

#### Programmatic Usage

```typescript
import { createClaudeAdapter, createOrchestrator } from 'nexus-agents';

const adapter = createClaudeAdapter({ model: 'claude-sonnet-4-6' });
const orchestrator = createOrchestrator({ adapter });
const result = await orchestrator.execute({
  description: 'Analyze this codebase for security issues',
});

if (result.ok) {
  console.log(result.value.summary);
}
```

### Source Files

| File                      | Purpose          |
| ------------------------- | ---------------- |
| `src/index.ts`            | Main exports     |
| `src/core/types/index.ts` | Type definitions |
| `src/adapters/index.ts`   | Model adapters   |
| `src/agents/index.ts`     | Agent framework  |
| `src/workflows/index.ts`  | Workflow engine  |

---

## Machine-Parseable Reference

<!-- BEGIN:CLI_COMMANDS -->

```yaml
cli_commands:
  - name: help
    flags: ['--help', '-h']
    mode: any
  - name: version
    flags: ['--version', '-v']
    mode: any
  - name: doctor
    mode: any
  - name: config init
    mode: any
  - name: expert list
    mode: any
  - name: workflow list
    mode: any
  - name: workflow run
    args: ['<template>']
    mode: orchestrator
  - name: server
    flags: ['--interactive']
    mode: server
  - name: review
    args: ['<url>']
    mode: orchestrator
  - name: routing-audit
    args: ['<task>']
    flags: ['--format', '--verbose', '--dry-run']
    mode: any
  - name: orchestrate
    args: ['<task>']
    mode: orchestrator
  - name: system-review
    flags: ['--create-issue', '--fix', '--verbose']
    mode: any
  - name: setup
    flags:
      ['--non-interactive', '--force', '--skip-mcp', '--skip-rules', '--skip-hooks', '--dry-run']
    mode: any
  - name: learning-metrics
    flags: ['--period', '--format', '--bandit-stats', '--export']
    mode: any
  - name: index
    subcommands: ['generate', 'check', 'diagram', 'validate', 'entrypoints', 'freshness', 'links']
    mode: any
  - name: hooks
    subcommands: ['session-start', 'session-end', 'pre-tool', 'post-tool', 'stop']
    mode: any
  - name: vote
    args: ['<proposal>']
    flags: ['--threshold', '--quick', '--strategy']
    mode: orchestrator
  - name: fitness-audit
    flags: ['--format', '--verbose']
    mode: any
  - name: research
    subcommands: ['query', 'add', 'discover', 'analyze']
    mode: any
  - name: release-validate
    flags: ['--version', '--verbose', '--strict', '--skip']
    mode: any
  - name: verify
    flags: ['--verbose']
    mode: any
```

<!-- END:CLI_COMMANDS -->

<!-- BEGIN:MCP_TOOLS -->

```yaml
mcp_tools:
  rate_limiting: shared token bucket (capacity: 100, refill: 10/sec)
  tools:
    - name: orchestrate
      auth: none
    - name: create_expert
      auth: none
    - name: execute_expert
      auth: none
    - name: run_workflow
      auth: none
    - name: delegate_to_model
      auth: none
    - name: consensus_vote
      auth: none
    - name: list_experts
      auth: none
    - name: list_workflows
      auth: none
    - name: research_query
      auth: none
    - name: research_add
      auth: none
    - name: research_discover
      auth: none
    - name: research_analyze
      auth: none
    - name: research_catalog_review
      auth: none
    - name: memory_query
      auth: none
    - name: memory_stats
      auth: none
    - name: issue_triage
      auth: none
    - name: run_graph_workflow
      auth: none
    - name: weather_report
      auth: none
    - name: execute_spec
      auth: none
    - name: registry_import
      auth: none
```

<!-- END:MCP_TOOLS -->

---

## Cross-References

- **CLAUDE.md** - Quick Reference section links here
- **README.md** - Installation links here for "full reference"
- **ARCHITECTURE.md** - Interface Layer section links here

---

_Generated per Process Automation Proposal #3 (Issue #210)_
_Approved by 5-agent consensus vote (8.6/10, unanimous)_
