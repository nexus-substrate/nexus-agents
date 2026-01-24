---
title: CLI Commands & Usage
description: Complete reference for nexus-agents command-line interface including all commands, options, and usage examples.
---

The nexus-agents CLI provides multiple commands for orchestration, workflow execution, debugging, and system management.

## Quick Start

```bash
# Install globally
npm install -g nexus-agents

# Verify installation
nexus-agents doctor

# Start MCP server (default mode)
nexus-agents

# Run standalone orchestration
nexus-agents orchestrate "Review this code for security issues"
```

## Mode Selection

Nexus-agents operates in three modes based on your use case:

| Mode           | Flag                  | Description                             |
| -------------- | --------------------- | --------------------------------------- |
| `server`       | `--mode=server`       | MCP server for Claude Desktop (default) |
| `orchestrator` | `--mode=orchestrator` | Standalone CLI, CI/CD pipelines         |
| `mesh`         | `--mode=mesh`         | Hybrid bidirectional mode               |

Mode is auto-detected in most cases. Use `nexus-agents --verbose` to see mode selection reasoning.

## Core Commands

### doctor

Check CLI health and verify dependencies.

```bash
nexus-agents doctor
```

**Output:**

```
Nexus-Agents Doctor v2.2.0 (ET)

[CHECK] Node.js version: v22.13.0 (required: >=22.0.0)
[CHECK] Configuration: Found nexus-agents.yaml
[CHECK] API keys: 2 of 3 configured
  - ANTHROPIC_API_KEY: Configured
  - OPENAI_API_KEY: Configured
  - GOOGLE_AI_API_KEY: Not set
[CHECK] CLI adapters available:
  - claude: Available (v1.0.40)
  - gemini: Available (v0.2.5)
  - codex: Not found

Status: Ready
```

### config init

Generate a starter configuration file.

```bash
nexus-agents config init
```

Creates `nexus-agents.yaml` with default settings:

```yaml
models:
  default: claude-sonnet-4
  tiers:
    fast: [claude-haiku-3, gpt-4o-mini]
    balanced: [claude-sonnet-4, gpt-4o]
    powerful: [claude-opus-4, o1-pro]

experts:
  builtin: true

security:
  sandbox:
    mode: policy
```

### expert list

List available expert agents.

```bash
nexus-agents expert list
```

**Output:**

```
Built-in Experts:
  - code          Code analysis and implementation
  - security      Security vulnerability detection
  - architecture  System design and patterns
  - testing       Test generation and coverage
  - documentation API docs and technical writing
  - devops        CI/CD and infrastructure

Custom Experts:
  - rust_expert   (from config)
```

### orchestrate

Execute a task using the agent swarm (standalone mode).

```bash
# Basic usage
nexus-agents orchestrate "Analyze this codebase for security issues"

# With context
nexus-agents orchestrate "Review auth.ts" --context='{"file": "src/auth.ts"}'

# Verbose output
nexus-agents orchestrate "Explain closures" --verbose
```

**Options:**

- `--context` - JSON object with additional context
- `--max-iterations` - Maximum refinement iterations (default: 3)
- `--verbose` - Show detailed execution trace

## Workflow Commands

### workflow list

List available workflow templates.

```bash
nexus-agents workflow list
```

**Output:**

```
Built-in Workflows:
  - code-review    Review code changes with security focus
  - pr-review      GitHub PR analysis and feedback
  - test-gen       Generate test cases for functions
  - doc-gen        Generate API documentation

Custom Workflows:
  - my-workflow    (from ./workflows/my-workflow.yaml)
```

### workflow run

Execute a workflow template.

```bash
# Run code review workflow
nexus-agents workflow run code-review --input='{"files": ["src/*.ts"]}'

# Run PR review
nexus-agents workflow run pr-review --input='{"url": "https://github.com/owner/repo/pull/123"}'

# Dry run (preview without execution)
nexus-agents workflow run test-gen --input='{"file": "utils.ts"}' --dry-run
```

**Options:**

- `--input` - JSON object with workflow inputs (required)
- `--dry-run` - Preview execution plan without running
- `--verbose` - Show step-by-step execution

## GitHub Integration

### review

Review a GitHub pull request.

```bash
nexus-agents review https://github.com/owner/repo/pull/123
```

The review includes:

- Security analysis
- Code quality assessment
- TypeScript best practices
- Test coverage recommendations

### review-demo

Interactive PR review demo with wizard UX.

```bash
nexus-agents review-demo
```

Prompts for PR URL and guides through the review process.

## Debugging Commands

### routing-audit

Debug routing decisions without executing tasks.

```bash
# Basic audit
nexus-agents routing-audit "Implement a sorting algorithm"

# JSON output for machine parsing
nexus-agents routing-audit "Complex reasoning task" --format=json

# With bandit statistics
nexus-agents routing-audit "Code generation task" --bandit-stats
```

**Sample Output:**

```
Task Profile Analysis:
  - Code generation: 85%
  - Reasoning complexity: High
  - Context required: 2,500 tokens

Budget Filter Results:
  [PASS] claude - Within budget
  [PASS] gemini - Within budget
  [PASS] codex  - Within budget

TOPSIS Ranking:
  1. claude  (0.82) - Best quality/cost balance
  2. codex   (0.71) - Fast, good for code
  3. gemini  (0.68) - Large context available

LinUCB Selection:
  Selected: claude (UCB score: 0.89)
  Mode: Exploitation (learned preference)
```

**Options:**

- `--format` - Output format: `text` (default), `json`
- `--verbose` - Show detailed scoring breakdown
- `--dry-run` - Skip actual model calls
- `--bandit-stats` - Show LinUCB arm statistics

### system-review

Run a 5-phase system health review.

```bash
# Basic review
nexus-agents system-review

# Create GitHub issue with findings
nexus-agents system-review --create-issue

# Auto-fix detected issues
nexus-agents system-review --fix --verbose
```

**Phases:**

1. Registry Reconciliation - Verify technique statuses
2. Documentation Sync - Check docs match implementation
3. Issue Health - Audit open/stale issues
4. Code Quality - Run lint and type checks
5. Security Scan - Check for vulnerabilities

### verify

Quick verification check.

```bash
nexus-agents verify
```

Runs essential health checks and reports status.

## Research Registry Commands

### research status

Show technique implementation status.

```bash
# Show all techniques
nexus-agents research status

# Filter by status
nexus-agents research status --status=implemented

# Show specific technique
nexus-agents research status aegean-consensus
```

### research overlap

Find overlapping or related techniques.

```bash
nexus-agents research overlap trinity-roles
```

### research add

Add a new paper from arXiv.

```bash
# Preview addition
nexus-agents research add 2501.06322 --dry-run

# Add and update registry
nexus-agents research add 2501.06322
```

## Validation & Testing

### validation-dashboard

Open the A/B testing and validation dashboard.

```bash
nexus-agents validation-dashboard
```

### swe-bench

Run SWE-bench evaluation for benchmarking.

```bash
# Run evaluation on SWE-bench Lite
nexus-agents swe-bench run --variant=lite --limit=10

# Evaluate predictions
nexus-agents swe-bench evaluate predictions.jsonl

# Check evaluation status
nexus-agents swe-bench status
```

## Consensus Voting

### vote

Run consensus voting with 5 specialized agents.

```bash
nexus-agents vote --proposal "Should we adopt TypeScript 6.0?"
```

Agents (Architect, Security, DevEx, AI/ML, PM) analyze the proposal and vote with reasoning.

## Global Options

These options work with all commands:

| Option         | Description           |
| -------------- | --------------------- |
| `--help`, `-h` | Display help text     |
| `--version`    | Display version       |
| `--verbose`    | Enable verbose output |
| `--mode`       | Force specific mode   |
| `--config`     | Path to config file   |

## Environment Variables

| Variable            | Purpose                 | Default               |
| ------------------- | ----------------------- | --------------------- |
| `ANTHROPIC_API_KEY` | Claude model access     | None                  |
| `OPENAI_API_KEY`    | OpenAI model access     | None                  |
| `GOOGLE_AI_API_KEY` | Gemini model access     | None                  |
| `NEXUS_LOG_LEVEL`   | Logging verbosity       | `info`                |
| `NEXUS_CONFIG_PATH` | Custom config file path | `./nexus-agents.yaml` |

## Examples

### CI/CD Integration

```bash
# In GitHub Actions
- name: Review PR
  run: |
    npx nexus-agents review ${{ github.event.pull_request.html_url }}
```

### Daily Codebase Review

```bash
#!/bin/bash
nexus-agents orchestrate "Review recent changes for security issues" \
  --context='{"since": "yesterday"}'
```

### Custom Workflow

```bash
nexus-agents workflow run my-workflow \
  --input='{"target": "production", "checks": ["security", "performance"]}'
```

## Next Steps

- [MCP Integration](/nexus-agents/guides/mcp-integration) - Set up Claude Desktop integration
- [Workflow Templates](/nexus-agents/guides/workflow-templates) - Create custom workflows
- [Debugging & Observability](/nexus-agents/guides/debugging-observability) - Debug agent behavior
