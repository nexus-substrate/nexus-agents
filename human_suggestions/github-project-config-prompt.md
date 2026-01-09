# Session: Configure GitHub Project Board for Agent Workflow

## Context

- **Project**: https://github.com/users/williamzujkowski/projects/2 (nexus-agents)
- **Current State**: Stock Kanban board with default columns (Backlog, Ready, In Progress, In Review, Done)
- **Permission Granted**: Update ticket handling processes, views, and workflow automations
- **Goal**: Maximize visibility into agent swarm workflow for developers and external observers

---

## Phase 1: Audit Current State

### Review Existing Configuration

1. **List all current views** and their configurations
2. **Document current custom fields** (if any)
3. **Review enabled workflow automations**
4. **Inventory all open issues** by type:
   - Epics (e.g., `[Epic] v2.4.0 Architecture Improvements`)
   - Research items (e.g., `Research: A-MEM Agentic Memory`)
   - Feature implementations (e.g., `feat: Implement Episodic Memory`)
   - Bugs, chores, documentation
5. **Identify gaps**: What information is missing that would help track agent work?

### Output

Create `project-audit.md` documenting current state before changes.

---

## Phase 2: Custom Fields Configuration

### Recommended Custom Fields

| Field Name              | Type          | Options                                                                    | Purpose                        |
| ----------------------- | ------------- | -------------------------------------------------------------------------- | ------------------------------ |
| **Priority**            | Single Select | 🔴 P0-Critical, 🟠 P1-High, 🟡 P2-Medium, 🟢 P3-Low                        | Triage and focus               |
| **Type**                | Single Select | 🎯 Epic, 🔬 Research, ✨ Feature, 🐛 Bug, 📚 Docs, 🔧 Chore, 🧪 Experiment | Categorization                 |
| **Effort**              | Single Select | XS (hours), S (1-2 days), M (3-5 days), L (1-2 weeks), XL (2+ weeks)       | Planning and velocity          |
| **Agent-Assignable**    | Single Select | ✅ Yes, ⚠️ With-Supervision, ❌ Human-Only                                 | Agent autonomy level           |
| **Research Paper**      | Text          | arXiv ID or URL                                                            | Link research issues to papers |
| **Sprint/Iteration**    | Iteration     | 2-week cycles                                                              | Time-boxed planning            |
| **Target Version**      | Single Select | v2.4.0, v2.5.0, v3.0.0, Backlog                                            | Release planning               |
| **Blocked By**          | Text          | Issue numbers                                                              | Dependency tracking            |
| **Last Agent Activity** | Date          | Auto-updated                                                               | Track agent engagement         |

### Implementation

```bash
# Use GitHub CLI to add fields (example)
gh project field-create 2 --owner williamzujkowski --name "Priority" --data-type "SINGLE_SELECT"
gh project field-create 2 --owner williamzujkowski --name "Type" --data-type "SINGLE_SELECT"
gh project field-create 2 --owner williamzujkowski --name "Effort" --data-type "SINGLE_SELECT"
gh project field-create 2 --owner williamzujkowski --name "Agent-Assignable" --data-type "SINGLE_SELECT"
```

---

## Phase 3: Views Configuration

### View 1: 🏃 Current Sprint (Default Board)

**Layout**: Board
**Purpose**: Day-to-day work tracking
**Columns**: Backlog → Ready → In Progress → In Review → Done
**Filters**: `iteration:@current OR status:"In Progress" OR status:"In Review"`
**Group By**: Status
**Sort**: Priority (descending)
**Visible Fields**: Title, Priority, Assignee, Effort, Agent-Assignable

### View 2: 📋 Full Backlog (Table)

**Layout**: Table
**Purpose**: Complete inventory of all work
**Filters**: `status:Backlog OR status:Ready`
**Sort**: Priority (descending), then Type
**Visible Fields**: Title, Type, Priority, Effort, Target Version, Research Paper, Blocked By
**Slice By**: Type (to see research vs features vs bugs)

### View 3: 🗺️ Public Roadmap

**Layout**: Roadmap
**Purpose**: External visibility into planned features
**Filters**: `type:Epic OR type:Feature` AND `target-version:*`
**Date Field**: Target Version (mapped to dates) or custom Milestone Date
**Group By**: Target Version
**Visible Fields**: Title, Type, Status, Target Version
**Note**: This view should be clean and user-friendly for external observers

### View 4: 🔬 Research Pipeline

**Layout**: Board
**Purpose**: Track research-to-implementation flow
**Columns**:

- 📖 To Read → 🔍 Under Review → 💡 Insights Extracted → 🔧 Implementation Planned → ✅ Applied
  **Filters**: `type:Research OR label:research`
  **Visible Fields**: Title, Research Paper, Priority, Blocked By
  **Custom Status Field**: Create "Research Status" separate from main Status

### View 5: 🤖 Agent Work Queue

**Layout**: Table
**Purpose**: What agents can autonomously pick up
**Filters**: `agent-assignable:Yes OR agent-assignable:With-Supervision` AND `status:Ready`
**Sort**: Priority (descending)
**Visible Fields**: Title, Priority, Effort, Agent-Assignable, Type
**Note**: This is the "feed" for agent task selection

### View 6: 📊 Sprint Overview (Table)

**Layout**: Table
**Purpose**: Sprint planning and retrospective
**Filters**: `iteration:@current`
**Group By**: Status
**Visible Fields**: Title, Type, Priority, Effort, Assignee, Agent-Assignable
**Show Totals**: Count per status, sum of effort

### View 7: 🚧 Blocked Items

**Layout**: Table
**Purpose**: Surface blocked work quickly
**Filters**: `blocked-by:*` OR `label:blocked`
**Sort**: Priority (descending)
**Visible Fields**: Title, Blocked By, Status, Priority, Assignee

### View 8: 📈 Velocity Insights

**Layout**: Insights (Charts)
**Charts to Create**:

- Burndown: Items completed per week
- Distribution: Items by Type (pie chart)
- Throughput: Items moved to Done per sprint
- Backlog Growth: New items vs completed over time

---

## Phase 4: Workflow Automations

### Built-in Workflows to Enable

| Workflow                  | Trigger                   | Action                 |
| ------------------------- | ------------------------- | ---------------------- |
| **Item added to project** | Issue/PR added            | Set Status → Backlog   |
| **Item reopened**         | Issue reopened            | Set Status → Ready     |
| **Item closed**           | Issue closed              | Set Status → Done      |
| **PR merged**             | PR merged                 | Set Status → Done      |
| **Code review requested** | PR ready for review       | Set Status → In Review |
| **Auto-archive**          | Status = Done for 14 days | Archive item           |

### Custom Automations (via GitHub Actions)

#### Auto-Label Research Issues

```yaml
# .github/workflows/project-automations.yml
name: Project Automations

on:
  issues:
    types: [opened, edited]

jobs:
  label-research:
    runs-on: ubuntu-latest
    steps:
      - name: Label research issues
        if: contains(github.event.issue.title, 'Research:') || contains(github.event.issue.title, 'arxiv')
        uses: actions/github-script@v7
        with:
          script: |
            await github.rest.issues.addLabels({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              labels: ['research', 'needs-triage']
            })
```

#### Auto-Set Priority Based on Labels

```yaml
set-priority:
  runs-on: ubuntu-latest
  steps:
    - name: Set P0 for critical
      if: contains(github.event.issue.labels.*.name, 'critical')
      # Use GraphQL to update project field
      env:
        GH_TOKEN: ${{ secrets.PROJECT_TOKEN }}
      run: |
        gh project item-edit --id $ITEM_ID --field-id $PRIORITY_FIELD --single-select-option-id $P0_OPTION
```

### Recommended Labels (for repo)

```
priority:p0-critical    🔴
priority:p1-high        🟠
priority:p2-medium      🟡
priority:p3-low         🟢
type:epic               🎯
type:research           🔬
type:feature            ✨
type:bug                🐛
type:docs               📚
type:chore              🔧
status:blocked          🚧
status:needs-triage     📥
agent:autonomous        🤖
agent:supervised        👁️
agent:human-only        👤
```

---

## Phase 5: Ticket Templates & Conventions

### Issue Templates

#### Research Issue Template

```markdown
---
name: Research
about: Track a research paper or technique to evaluate
title: 'Research: [Paper Title] (arxiv:XXXX.XXXXX)'
labels: research, needs-triage
---

## Paper Details

- **Title**:
- **Authors**:
- **Link**: https://arxiv.org/abs/XXXX.XXXXX
- **Published**:

## Relevance to Project

<!-- Why should we investigate this? -->

## Key Techniques

<!-- What specific methods does this paper introduce? -->

## Potential Applications

<!-- How could we apply this to nexus-agents? -->

## Evaluation Criteria

- [ ] Paper read and summarized
- [ ] Techniques extracted to `/docs/research/topics/`
- [ ] Implementation feasibility assessed
- [ ] Decision: Apply / Defer / Reject

## Implementation Issues

<!-- Link to feature issues that implement techniques from this paper -->
```

#### Feature Issue Template

```markdown
---
name: Feature
about: Propose a new feature
title: 'feat: [Brief Description]'
labels: feature, needs-triage
---

## Summary

<!-- One paragraph description -->

## Motivation

<!-- Why do we need this? What problem does it solve? -->

## Research Foundation

<!-- Link to research issues or papers that inform this feature -->

- Related Research: #issue

## Proposed Implementation

<!-- High-level approach -->

## Acceptance Criteria

- [ ]
- [ ]
- [ ]

## Agent Assignability

- [ ] Fully autonomous
- [ ] With supervision
- [ ] Human only

## Effort Estimate

- [ ] XS (hours)
- [ ] S (1-2 days)
- [ ] M (3-5 days)
- [ ] L (1-2 weeks)
- [ ] XL (2+ weeks)
```

#### Epic Template

```markdown
---
name: Epic
about: Large initiative spanning multiple issues
title: '[Epic] [Version/Initiative Name]'
labels: epic
---

## Overview

<!-- What is this epic about? -->

## Goals

1.
2.
3.

## Success Metrics

<!-- How will we know this is complete/successful? -->

## Child Issues

<!-- Link all issues that are part of this epic -->

- [ ] #issue - Description
- [ ] #issue - Description

## Target Version

<!-- When do we aim to complete this? -->

## Dependencies

<!-- External factors or blocking issues -->
```

---

## Phase 6: Agent Integration Points

### Task Selection Protocol

When agents query for work, they should:

1. **Check Agent Work Queue view** for `agent-assignable:Yes` items
2. **Respect priority ordering**: P0 > P1 > P2 > P3
3. **Consider effort estimates**: Prefer appropriately-sized tasks
4. **Check blocked status**: Skip items with `blocked-by` populated
5. **Update status immediately** when picking up work:
   ```bash
   gh project item-edit --id $ITEM_ID --field-id $STATUS_FIELD --single-select-option-id $IN_PROGRESS
   ```

### Status Update Protocol

Agents should update project status at these points:

| Event                    | Status Change           | Additional Action          |
| ------------------------ | ----------------------- | -------------------------- |
| Task picked up           | Ready → In Progress     | Set assignee               |
| PR opened                | In Progress (no change) | Link PR to issue           |
| PR ready for review      | In Progress → In Review | None                       |
| PR merged / Issue closed | In Review → Done        | Update Last Agent Activity |
| Blocked encountered      | Add `blocked` label     | Update Blocked By field    |

### Activity Logging

For visibility into agent work patterns:

```bash
# When starting work
gh issue comment $ISSUE_NUMBER --body "🤖 Agent starting work on this issue. Estimated completion: $EFFORT"

# When completing
gh issue comment $ISSUE_NUMBER --body "🤖 Agent completed. PR: #$PR_NUMBER"

# When blocked
gh issue comment $ISSUE_NUMBER --body "🚧 Agent blocked. Reason: $REASON. Blocked by: #$BLOCKING_ISSUE"
```

---

## Phase 7: Insights Configuration

### Charts to Create

1. **Velocity Chart** (Line)
   - X-axis: Week
   - Y-axis: Issues closed
   - Filter: Last 12 weeks

2. **Work Distribution** (Pie)
   - Group by: Type
   - Filter: Status != Done

3. **Priority Distribution** (Bar)
   - Group by: Priority
   - Filter: Status = Backlog OR Ready

4. **Agent vs Human Work** (Stacked Bar)
   - Group by: Agent-Assignable
   - Stack by: Status

5. **Research Pipeline** (Funnel)
   - Stages: To Read → Reviewed → Applied
   - Filter: Type = Research

---

## Phase 8: Implementation Checklist

### Immediate Actions (Do Now)

- [ ] Create custom fields (Priority, Type, Effort, Agent-Assignable)
- [ ] Configure single-select options with colors and descriptions
- [ ] Create core views (Current Sprint, Full Backlog, Public Roadmap)
- [ ] Enable built-in workflow automations
- [ ] Apply fields to existing issues in backlog

### Short-term (This Week)

- [ ] Create Research Pipeline view
- [ ] Create Agent Work Queue view
- [ ] Set up issue templates in repository
- [ ] Apply labels to repository
- [ ] Backfill Priority and Type for existing issues

### Medium-term (This Sprint)

- [ ] Configure Insights charts
- [ ] Create GitHub Actions for advanced automations
- [ ] Document agent integration protocols
- [ ] Test full workflow: issue → agent pickup → PR → merge → done

### Ongoing

- [ ] Review and refine views based on usage
- [ ] Adjust automations as workflow evolves
- [ ] Archive completed sprints
- [ ] Publish sprint retrospectives

---

## Validation Criteria

After implementation, verify:

1. **External users** can see the Public Roadmap view and understand planned features
2. **Agents** can query the Agent Work Queue and find appropriately-scoped work
3. **Developers** can quickly see current sprint state and blocked items
4. **Research pipeline** clearly shows paper-to-implementation flow
5. **Automations** correctly update status on issue/PR lifecycle events
6. **Insights** provide useful velocity and distribution metrics

---

## Notes for Swarm Execution

- Use `gh` CLI for project modifications where possible
- For complex GraphQL operations, document the mutation for reproducibility
- Create issues for any configuration that can't be automated
- Update `CLAUDE.md` with new ticket handling conventions
- Add project board conventions to repository documentation

---

**Begin with Phase 1: Audit Current State.**
