# GitHub Project Board Configuration: Activation Prompt

> Copy this prompt directly to your swarm to configure the nexus-agents project board.

---

```markdown
# Session: Configure nexus-agents Project Board

## Context

- Project: https://github.com/users/williamzujkowski/projects/2
- Permission: Full access to update views, fields, workflows, and ticket conventions
- Goal: Optimize for agent swarm workflow visibility and external roadmap transparency

## Phase 1: Audit

Document current state before changes:

- List all views and their configurations
- List all custom fields
- List enabled workflow automations
- Inventory all open issues by type (Epic, Research, Feature, Bug)

Output: `project-audit.md`

## Phase 2: Custom Fields

Create these fields if they don't exist:

| Field            | Type          | Options                                                     |
| ---------------- | ------------- | ----------------------------------------------------------- |
| Priority         | Single Select | 🔴 P0-Critical, 🟠 P1-High, 🟡 P2-Medium, 🟢 P3-Low         |
| Type             | Single Select | 🎯 Epic, 🔬 Research, ✨ Feature, 🐛 Bug, 📚 Docs, 🔧 Chore |
| Effort           | Single Select | XS, S, M, L, XL                                             |
| Agent-Assignable | Single Select | ✅ Yes, ⚠️ Supervised, ❌ Human-Only                        |
| Target Version   | Single Select | v2.4.0, v2.5.0, v3.0.0, Backlog                             |
| Research Paper   | Text          | arXiv links                                                 |
| Blocked By       | Text          | Issue numbers                                               |

## Phase 3: Create Views

### View 1: 🏃 Current Sprint (Board - Default)

- Filter: `status:"In Progress" OR status:"In Review" OR status:Ready`
- Group: Status columns
- Sort: Priority desc
- Fields: Title, Priority, Assignee, Effort

### View 2: 📋 Full Backlog (Table)

- Filter: All open items
- Sort: Priority desc, then Type
- Slice by: Type
- Fields: Title, Type, Priority, Effort, Target Version, Blocked By

### View 3: 🗺️ Public Roadmap (Roadmap)

- Filter: `type:Epic OR type:Feature`
- Date field: Target Version or milestone
- Group: Target Version
- Fields: Title, Type, Status
- Purpose: External visibility—keep clean and jargon-free

### View 4: 🔬 Research Pipeline (Board)

- Custom columns: 📖 To Read → 🔍 Reviewing → 💡 Insights → 🔧 Implementing → ✅ Applied
- Filter: `type:Research`
- Fields: Title, Research Paper, Priority

### View 5: 🤖 Agent Work Queue (Table)

- Filter: `agent-assignable:Yes` AND `status:Ready`
- Sort: Priority desc
- Fields: Title, Priority, Effort, Type
- Purpose: Agent task selection feed

### View 6: 🚧 Blocked Items (Table)

- Filter: `blocked-by:*` OR `label:blocked`
- Fields: Title, Blocked By, Status, Priority

## Phase 4: Workflow Automations

Enable these built-in workflows:

- Item added → Status: Backlog
- Item reopened → Status: Ready
- Item closed → Status: Done
- PR merged → Status: Done
- Auto-archive: Done items after 14 days

## Phase 5: Backfill Existing Issues

Apply appropriate fields to current backlog:

- #106: Type=Epic, Priority=P1, Target=v2.4.0
- #122, #123: Type=Research, Priority=P2
- #128, #130, #131: Type=Feature, Priority=P2, Agent-Assignable=Yes

## Phase 6: Create Labels (in repo)
```

priority:p0-critical 🔴
priority:p1-high 🟠
priority:p2-medium 🟡
priority:p3-low 🟢
type:epic 🎯
type:research 🔬
type:feature ✨
type:bug 🐛
agent:autonomous 🤖
agent:supervised 👁️
status:blocked 🚧

```

## Phase 7: Document Conventions
Update repository docs with:
- How agents should pick up work (query Agent Work Queue, respect priority)
- Status update protocol (when to move items between columns)
- Issue template conventions (Research, Feature, Epic formats)

## Validation
After implementation, verify:
- [ ] External users can understand Public Roadmap
- [ ] Agents can query Agent Work Queue effectively
- [ ] Blocked items surface immediately
- [ ] Research-to-implementation flow is traceable
- [ ] Automations fire correctly on lifecycle events

---

Begin with Phase 1: Audit current state.
```

---

## Quick Reference: Views at a Glance

| View                 | Layout  | Who Uses It       | Purpose                |
| -------------------- | ------- | ----------------- | ---------------------- |
| 🏃 Current Sprint    | Board   | Active developers | Day-to-day work        |
| 📋 Full Backlog      | Table   | Planning          | All work inventory     |
| 🗺️ Public Roadmap    | Roadmap | External users    | Feature timeline       |
| 🔬 Research Pipeline | Board   | Research workflow | Paper → Implementation |
| 🤖 Agent Work Queue  | Table   | Swarm agents      | Task selection         |
| 🚧 Blocked Items     | Table   | Unblocking        | Surface impediments    |

---

## CLI Commands Reference

```bash
# List project fields
gh project field-list 2 --owner williamzujkowski

# Create a single-select field
gh project field-create 2 --owner williamzujkowski \
  --name "Priority" --data-type "SINGLE_SELECT"

# Add an item to project
gh project item-add 2 --owner williamzujkowski --url https://github.com/owner/repo/issues/123

# Edit item field
gh project item-edit --id ITEM_ID --field-id FIELD_ID --single-select-option-id OPTION_ID

# List items
gh project item-list 2 --owner williamzujkowski --format json
```
