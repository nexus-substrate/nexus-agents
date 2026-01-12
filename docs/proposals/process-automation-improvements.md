# Process Automation Improvements Proposal

**Date:** 2026-01-11 (ET)
**Status:** Pending Consensus Vote
**Epic:** #209
**Author:** Consensus Voting Swarm

---

## Overview

This document presents four process improvement proposals identified during the meta-review of CLAUDE.md and CODING_STANDARDS.md (#199). Each proposal will be voted on by the 5-agent consensus swarm.

---

## Proposal 1: Automated Consensus Voting Workflow

### Problem Statement

The 5-agent consensus voting protocol is powerful but entirely manual. Running a consensus vote requires:

1. Manually spawning 5 agents with role-specific prompts
2. Collecting and synthesizing votes
3. Calculating thresholds (majority/supermajority/unanimous)
4. Documenting results

This friction reduces usage and creates inconsistency in how votes are conducted.

### Proposed Solution

Create a reusable workflow template `consensus-vote.yaml` that automates the voting process:

```yaml
name: consensus-vote
description: Run 5-agent consensus voting on a proposal
version: 1.0.0

inputs:
  proposal:
    type: string
    description: The proposal to vote on
    required: true
  threshold:
    type: string
    enum: [majority, supermajority, unanimous]
    default: supermajority
  agents:
    type: array
    default: [architect, security, devex, ai_ml, pm]

steps:
  - id: spawn_voters
    action: parallel_spawn
    agents: ${inputs.agents}
    prompt_template: |
      You are the ${agent.role} agent voting on this proposal:

      ${inputs.proposal}

      Vote: APPROVE / DISSENT / ABSTAIN
      Score: X/10
      Reasoning: (brief explanation)

  - id: collect_votes
    action: aggregate
    dependsOn: [spawn_voters]

  - id: calculate_result
    action: consensus_check
    threshold: ${inputs.threshold}
    dependsOn: [collect_votes]

  - id: document_result
    action: create_issue_comment
    epic: ${context.epic_id}
    dependsOn: [calculate_result]
```

### Integration Points

- **CLI:** `nexus-agents vote --proposal "..." --threshold supermajority`
- **MCP:** New `run_consensus_vote` tool
- **Workflow:** Can be composed into other workflows (e.g., self-development.yaml Phase 6)

### Success Metrics

| Metric                     | Before         | After             |
| -------------------------- | -------------- | ----------------- |
| Time to run consensus vote | ~30 min manual | < 5 min automated |
| Vote consistency           | Variable       | 100% structured   |
| Vote documentation         | Manual         | Automatic         |

### Implementation Effort

- **Complexity:** Medium
- **Files to create:**
  - `workflows/templates/consensus-vote.yaml`
  - `src/workflows/steps/consensus-step.ts`
  - `src/cli/vote-command.ts`
- **Estimated LOC:** ~400

---

## Proposal 2: Documentation CI Gate

### Problem Statement

The meta-review revealed 73% documentation debt (92% implementation vs 19% documentation). Features are implemented but undocumented because there's no enforcement mechanism.

### Proposed Solution

Add a CI check that:

1. Detects new/modified source files
2. Checks for corresponding documentation updates
3. Fails the build if documentation is missing for significant changes

```yaml
# .github/workflows/docs-check.yml
name: Documentation Gate

on:
  pull_request:
    paths:
      - 'packages/nexus-agents/src/**'

jobs:
  check-docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Check documentation coverage
        run: |
          # Get changed source files
          CHANGED=$(git diff --name-only origin/main -- 'packages/nexus-agents/src/**/*.ts')

          # For each changed file, check for corresponding doc
          for file in $CHANGED; do
            # Skip test files and types
            if [[ $file == *".test.ts" ]] || [[ $file == *"/types/"* ]]; then
              continue
            fi

            # Check if README, ARCHITECTURE, or CLAUDE.md was updated
            DOC_CHANGED=$(git diff --name-only origin/main -- 'README.md' 'ARCHITECTURE.md' 'CLAUDE.md' 'docs/**/*.md')

            if [ -z "$DOC_CHANGED" ]; then
              echo "::warning file=$file::No documentation updated for source change"
            fi
          done

      - name: Require doc for new modules
        run: |
          # New directories under src/ must have corresponding doc
          NEW_DIRS=$(git diff --name-only --diff-filter=A origin/main -- 'packages/nexus-agents/src/**/index.ts')

          for dir in $NEW_DIRS; do
            MODULE=$(dirname $dir | sed 's|packages/nexus-agents/src/||')
            if ! grep -q "$MODULE" ARCHITECTURE.md; then
              echo "::error::New module '$MODULE' must be documented in ARCHITECTURE.md"
              exit 1
            fi
          done
```

### Enforcement Levels

| Level     | Behavior                     | Use Case                      |
| --------- | ---------------------------- | ----------------------------- |
| `warn`    | Warning annotation, no block | Default for minor changes     |
| `require` | Block merge                  | New modules, breaking changes |
| `suggest` | AI-generated doc suggestion  | Large additions               |

### Success Metrics

| Metric                | Before     | After         |
| --------------------- | ---------- | ------------- |
| Undocumented features | 73%        | < 20% target  |
| Doc review in PRs     | Rare       | Automatic     |
| Doc debt accumulation | Continuous | Blocked at PR |

### Implementation Effort

- **Complexity:** Low
- **Files to create:**
  - `.github/workflows/docs-check.yml`
  - `scripts/check-doc-coverage.sh`
- **Estimated LOC:** ~100

---

## Proposal 3: Create ENTRYPOINTS.md

### Problem Statement

Entrypoint documentation is scattered across:

- CLAUDE.md (partial CLI commands)
- README.md (installation, basic usage)
- ARCHITECTURE.md (interfaces only)
- Source code (definitive but requires reading code)

Users cannot find a single source of truth for "how do I interact with nexus-agents?"

### Proposed Solution

Create `docs/ENTRYPOINTS.md` as the canonical entrypoint reference:

````markdown
# Nexus-Agents Entrypoints

**Last Updated:** 2026-01-11 (ET)
**Canonical Source:** This document is the single source of truth for all entrypoints.

## CLI Commands

| Command                              | Description               | Mode         |
| ------------------------------------ | ------------------------- | ------------ |
| `nexus-agents`                       | Start MCP server          | server       |
| `nexus-agents doctor`                | Check installation health | any          |
| `nexus-agents config init`           | Generate config file      | any          |
| `nexus-agents expert list`           | List available experts    | any          |
| `nexus-agents workflow list`         | List workflow templates   | any          |
| `nexus-agents workflow run <name>`   | Execute workflow          | orchestrator |
| `nexus-agents routing-audit <task>`  | Debug model routing       | any          |
| `nexus-agents orchestrate <task>`    | Execute task standalone   | orchestrator |
| `nexus-agents review <url>`          | Review GitHub PR          | orchestrator |
| `nexus-agents vote --proposal "..."` | Run consensus vote        | orchestrator |

### Mode Selection

...

## MCP Tools

| Tool                | Description             | Schema Location                  |
| ------------------- | ----------------------- | -------------------------------- |
| `orchestrate`       | Task orchestration      | `src/mcp/tools/orchestrate.ts`   |
| `create_expert`     | Create expert agent     | `src/mcp/tools/create-expert.ts` |
| `run_workflow`      | Execute workflow        | `src/mcp/tools/run-workflow.ts`  |
| `delegate_to_model` | Route to specific model | `src/mcp/tools/delegate.ts`      |

## REST API

| Method | Endpoint               | Description        |
| ------ | ---------------------- | ------------------ |
| POST   | `/api/v1/orchestrate`  | Task orchestration |
| POST   | `/api/v1/delegate`     | Model delegation   |
| POST   | `/api/v1/expert`       | Create expert      |
| GET    | `/api/v1/expert/types` | List expert types  |
| POST   | `/api/v1/workflow`     | Run workflow       |
| GET    | `/health`              | Health check       |
| GET    | `/metrics`             | Prometheus metrics |

### Authentication

...

## Programmatic API

```typescript
import { createServer, TechLead, Expert } from 'nexus-agents';
...
```
````

````

### Cross-Reference Updates

When ENTRYPOINTS.md is created:
1. CLAUDE.md links to it instead of duplicating
2. README.md links to it for "full reference"
3. ARCHITECTURE.md links to it for "user-facing interfaces"

### Success Metrics

| Metric | Before | After |
|--------|--------|-------|
| Entrypoint sources | 4 scattered | 1 canonical |
| CLI command discovery | Grep source | Read doc |
| REST API discovery | Undocumented | Documented |

### Implementation Effort

- **Complexity:** Low
- **Files to create:**
  - `docs/ENTRYPOINTS.md`
- **Files to update:**
  - `CLAUDE.md` (add link)
  - `README.md` (add link)
  - `ARCHITECTURE.md` (add link)
- **Estimated LOC:** ~300

---

## Proposal 4: Automated System Review

### Problem Statement

The System Review Protocol in CLAUDE.md has clear trigger conditions:
- Open issues drop below 5
- EPIC issue closed
- 7 days since last review
- Manual `/system-review` command

But there's no automation. Reviews depend on manual memory and discipline.

### Proposed Solution

Create a GitHub Action that:
1. Runs on schedule (weekly) or on trigger conditions
2. Executes the 5-phase review checklist
3. Creates a "System Review: YYYY-MM-DD" issue with findings

```yaml
# .github/workflows/system-review.yml
name: System Review

on:
  schedule:
    - cron: '0 9 * * 1'  # Weekly on Monday 9am UTC (5am ET)
  workflow_dispatch:
    inputs:
      trigger_reason:
        description: 'Reason for manual trigger'
        required: false
  issues:
    types: [closed]

jobs:
  check-trigger:
    runs-on: ubuntu-latest
    outputs:
      should_run: ${{ steps.check.outputs.run }}
    steps:
      - id: check
        run: |
          # Check trigger conditions
          if [[ "${{ github.event_name }}" == "schedule" ]]; then
            echo "run=true" >> $GITHUB_OUTPUT
          elif [[ "${{ github.event_name }}" == "workflow_dispatch" ]]; then
            echo "run=true" >> $GITHUB_OUTPUT
          elif [[ "${{ github.event.issue.labels.*.name }}" == *"epic"* ]]; then
            echo "run=true" >> $GITHUB_OUTPUT
          else
            echo "run=false" >> $GITHUB_OUTPUT
          fi

  run-review:
    needs: check-trigger
    if: needs.check-trigger.outputs.should_run == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Phase 1 - Registry Reconciliation
        id: registry
        run: |
          # Count techniques by status
          IMPLEMENTED=$(grep -c "status: implemented" docs/research/registry/techniques.yaml)
          PLANNED=$(grep -c "status: planned" docs/research/registry/techniques.yaml)

          echo "implemented=$IMPLEMENTED" >> $GITHUB_OUTPUT
          echo "planned=$PLANNED" >> $GITHUB_OUTPUT

      - name: Phase 2 - Documentation Sync
        id: docs
        run: |
          # Check file freshness
          CLAUDE_DAYS=$(( ($(date +%s) - $(stat -c %Y CLAUDE.md)) / 86400 ))
          ARCH_DAYS=$(( ($(date +%s) - $(stat -c %Y ARCHITECTURE.md)) / 86400 ))

          echo "claude_age=$CLAUDE_DAYS" >> $GITHUB_OUTPUT
          echo "arch_age=$ARCH_DAYS" >> $GITHUB_OUTPUT

      - name: Phase 3 - Issue Health
        id: issues
        run: |
          OPEN=$(gh issue list --state open --json number | jq length)
          STALE=$(gh issue list --state open --json updatedAt --jq '[.[] | select(.updatedAt < (now - 30*86400 | todate))] | length')

          echo "open_count=$OPEN" >> $GITHUB_OUTPUT
          echo "stale_count=$STALE" >> $GITHUB_OUTPUT
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Create Review Issue
        run: |
          gh issue create \
            --title "System Review: $(date +%Y-%m-%d)" \
            --body "## System Review Results

          **Trigger:** ${{ github.event_name }}
          **Date:** $(date '+%Y-%m-%d %H:%M:%S ET')

          ### Phase 1: Registry Reconciliation
          - Implemented techniques: ${{ steps.registry.outputs.implemented }}
          - Planned techniques: ${{ steps.registry.outputs.planned }}

          ### Phase 2: Documentation Sync
          - CLAUDE.md last updated: ${{ steps.docs.outputs.claude_age }} days ago
          - ARCHITECTURE.md last updated: ${{ steps.docs.outputs.arch_age }} days ago

          ### Phase 3: Issue Health
          - Open issues: ${{ steps.issues.outputs.open_count }}
          - Stale issues (>30 days): ${{ steps.issues.outputs.stale_count }}

          ### Action Items
          - [ ] Review stale issues
          - [ ] Update outdated documentation
          - [ ] Close resolved issues
          " \
            --label "system-review"
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
````

### CLI Integration

Also add a CLI command for manual execution:

```bash
nexus-agents system-review [--create-issue]
```

### Success Metrics

| Metric                | Before       | After             |
| --------------------- | ------------ | ----------------- |
| Review frequency      | Sporadic     | Weekly guaranteed |
| Review consistency    | Variable     | Standardized      |
| Finding documentation | Manual       | Automatic issue   |
| Trigger reliability   | Human memory | Automated         |

### Implementation Effort

- **Complexity:** Medium
- **Files to create:**
  - `.github/workflows/system-review.yml`
  - `src/cli/system-review-command.ts`
- **Estimated LOC:** ~250

---

## Voting Instructions

Each proposal will be evaluated by the 5-agent consensus swarm:

| Agent     | Focus                                 |
| --------- | ------------------------------------- |
| Architect | System coherence, integration quality |
| Security  | Security implications, audit trail    |
| DevEx     | Developer productivity, ease of use   |
| AI/ML     | AI integration, automation quality    |
| PM        | User value, prioritization            |

**Threshold:** Supermajority (≥4/5 APPROVE) for implementation approval.

**Voting Format:**

```
PROPOSAL: [1-4]
VOTE: APPROVE / DISSENT / ABSTAIN
SCORE: X/10
REASONING: (brief explanation)
AMENDMENTS: (optional suggested changes)
```

---

## Decision Record

**Voting Date:** 2026-01-11 (ET)
**Threshold:** Supermajority (≥4/5 APPROVE)

| Proposal              | Arch | Sec  | DevEx | AI/ML | PM   | Avg | Result             |
| --------------------- | ---- | ---- | ----- | ----- | ---- | --- | ------------------ |
| 1. Consensus Workflow | ✅ 8 | ✅ 7 | ✅ 7  | ✅ 9  | ✅ 8 | 7.8 | **APPROVED (5/5)** |
| 2. Documentation CI   | ✅ 7 | ✅ 8 | ❌ 4  | ✅ 6  | ✅ 7 | 6.4 | **APPROVED (4/5)** |
| 3. ENTRYPOINTS.md     | ✅ 9 | ✅ 9 | ✅ 9  | ✅ 7  | ✅ 9 | 8.6 | **APPROVED (5/5)** |
| 4. System Review      | ✅ 8 | ✅ 8 | ✅ 8  | ✅ 8  | ✅ 8 | 8.0 | **APPROVED (5/5)** |

### Priority Order (Consensus)

1. **ENTRYPOINTS.md** - Highest score (8.6), unanimous approval, foundation for other work
2. **Automated System Review** - High score (8.0), unanimous, enables continuous validation
3. **Automated Consensus Voting** - High score (7.8), unanimous, enables faster decisions
4. **Documentation CI Gate** - Lower score (6.4), DevEx dissented on blocking behavior

### Key Amendments Incorporated

- **Proposal 1:** Integrate with `IConsensusEngine`, add `--dry-run` flag
- **Proposal 2:** Change to warning-only with escape hatch `[skip-docs]`
- **Proposal 3:** Add machine-parseable sections, include auth/rate-limit columns
- **Proposal 4:** Add metrics trending, `--fix` flag for auto-corrections

### Implementation Issues

- #210 - Create ENTRYPOINTS.md
- #211 - Automated System Review workflow
- #212 - Automated Consensus Voting workflow
- #213 - Documentation CI Gate

---

_Voted per CLAUDE.md Consensus Voting Protocol - 5-agent swarm_
