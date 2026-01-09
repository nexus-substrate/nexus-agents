# nexus-agents Workflow Integration Guide

## Workflow Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ISSUE LIFECYCLE                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────┐    ┌──────────┐    ┌─────────────┐    ┌───────────┐    ┌────┐│
│  │ BACKLOG  │───▶│  READY   │───▶│ IN PROGRESS │───▶│ IN REVIEW │───▶│DONE││
│  └──────────┘    └──────────┘    └─────────────┘    └───────────┘    └────┘│
│       │              │                  │                 │                 │
│       │              │                  │                 │                 │
│  [Issue        [Triaged &         [Agent/Human      [PR opened,       [Merged/│
│   Created]      Prioritized]       picks up]        review req]      Closed] │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        RESEARCH PIPELINE                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────┐    ┌───────────┐    ┌──────────┐    ┌────────────┐    ┌──────┐│
│  │ TO READ  │───▶│ REVIEWING │───▶│ INSIGHTS │───▶│IMPLEMENTING│───▶│APPLIED│
│  │   📖     │    │    🔍     │    │    💡    │    │     🔧     │    │  ✅  ││
│  └──────────┘    └───────────┘    └──────────┘    └────────────┘    └──────┘│
│       │               │                │                │                   │
│  [Paper         [Reading &       [Key techniques  [Feature issue    [Merged  │
│   identified]    evaluating]      extracted]       created]         & docs]  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Agent Task Selection Flow

```
                    ┌─────────────────────┐
                    │   AGENT STARTS      │
                    │   WORK SESSION      │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ Query Agent Work    │
                    │ Queue View          │
                    │ (status:Ready AND   │
                    │  agent-assignable:  │
                    │  Yes)               │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
              ┌─────│ Items Available?    │─────┐
              │     └─────────────────────┘     │
              │ No                              │ Yes
              ▼                                 ▼
    ┌─────────────────┐              ┌─────────────────────┐
    │ Check Supervised│              │ Sort by Priority    │
    │ Queue           │              │ P0 > P1 > P2 > P3   │
    │ (agent-assign:  │              └──────────┬──────────┘
    │  Supervised)    │                         │
    └────────┬────────┘                         ▼
             │                       ┌─────────────────────┐
             │                       │ Check Blocked By    │
             │                       │ field is empty?     │
             │                       └──────────┬──────────┘
             │                                  │
             │                    ┌─────────────┴─────────────┐
             │                    │ Yes                       │ No
             │                    ▼                           ▼
             │         ┌─────────────────────┐    ┌─────────────────────┐
             │         │ Consider Effort     │    │ Skip, try next item │
             │         │ (prefer matching    │    └─────────────────────┘
             │         │  session capacity)  │
             │         └──────────┬──────────┘
             │                    │
             │                    ▼
             │         ┌─────────────────────┐
             └────────▶│ CLAIM TASK          │
                       │ • Set status:       │
                       │   In Progress       │
                       │ • Set assignee      │
                       │ • Comment: 🤖       │
                       │   Agent starting    │
                       └──────────┬──────────┘
                                  │
                                  ▼
                       ┌─────────────────────┐
                       │ DO WORK             │
                       └──────────┬──────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                    ▼                           ▼
         ┌─────────────────┐         ┌─────────────────┐
         │ SUCCESS         │         │ BLOCKED         │
         │ • Open PR       │         │ • Add blocked   │
         │ • Link to issue │         │   label         │
         │ • Request review│         │ • Update        │
         │ • Status:       │         │   Blocked By    │
         │   In Review     │         │ • Comment why   │
         └─────────────────┘         └─────────────────┘
```

---

## View Purpose Matrix

| Audience             | Primary View         | Secondary View       | Goal                        |
| -------------------- | -------------------- | -------------------- | --------------------------- |
| **External Users**   | 🗺️ Public Roadmap    | —                    | Understand planned features |
| **Project Owner**    | 📋 Full Backlog      | 📊 Insights          | Strategic planning          |
| **Active Developer** | 🏃 Current Sprint    | 🚧 Blocked Items     | Daily execution             |
| **Agent Swarm**      | 🤖 Agent Work Queue  | 🔬 Research Pipeline | Task selection              |
| **Researcher**       | 🔬 Research Pipeline | 📋 Full Backlog      | Paper-to-code flow          |

---

## Field Dependencies

```
Issue Created
     │
     ▼
┌─────────────────────────────────────────┐
│ REQUIRED FIELDS (set on creation/triage)│
├─────────────────────────────────────────┤
│ • Type (Epic/Research/Feature/Bug/...)  │
│ • Priority (P0/P1/P2/P3)                │
│ • Effort (XS/S/M/L/XL)                  │
│ • Agent-Assignable (Yes/Supervised/No)  │
└─────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────┐
│ CONDITIONAL FIELDS                       │
├─────────────────────────────────────────┤
│ IF Type = Research:                      │
│   • Research Paper (arXiv link)          │
│                                          │
│ IF Type = Epic:                          │
│   • Target Version (release)             │
│                                          │
│ IF blocked:                              │
│   • Blocked By (issue numbers)           │
└─────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────┐
│ AUTO-SET FIELDS                          │
├─────────────────────────────────────────┤
│ • Status (via workflow automations)      │
│ • Assignee (when claimed)                │
│ • Last Agent Activity (on agent action)  │
└─────────────────────────────────────────┘
```

---

## Automation Trigger Reference

| Event                                | Automation          | Result               |
| ------------------------------------ | ------------------- | -------------------- |
| Issue opened                         | Auto-add to project | Status = Backlog     |
| Issue labeled `priority:p0-critical` | (via Actions)       | Priority field = P0  |
| Issue moved to Ready                 | None (manual)       | —                    |
| Issue assigned                       | None                | —                    |
| PR opened linking issue              | (via Actions)       | Status = In Progress |
| PR marked ready for review           | Built-in workflow   | Status = In Review   |
| PR merged                            | Built-in workflow   | Status = Done        |
| Issue closed                         | Built-in workflow   | Status = Done        |
| Item in Done > 14 days               | Auto-archive        | Archived             |

---

## Status Transition Rules

```
BACKLOG ──────────────────────────────────────────────────▶ DONE
   │         Can skip intermediate states                    ▲
   │         (e.g., quick docs fix)                          │
   ▼                                                         │
 READY ◀─────────────────────────────────────────────────────┤
   │         Can return if blocked or needs rework           │
   │                                                         │
   ▼                                                         │
IN PROGRESS ◀────────────────────────────────────────────────┤
   │              Can return if review rejected              │
   │                                                         │
   ▼                                                         │
IN REVIEW ───────────────────────────────────────────────────┘
```

**Rules:**

- Forward transitions: Automated where possible
- Backward transitions: Always manual with comment explaining why
- Skip transitions: Allowed for trivial changes (must justify)

---

## Integration with CLAUDE.md

Add these conventions to your `CLAUDE.md`:

```markdown
## GitHub Project Integration

### Ticket Handling

- All work must have a corresponding GitHub issue
- Issues are tracked in: https://github.com/users/williamzujkowski/projects/2
- Use issue templates for consistency

### Agent Work Selection

- Query "🤖 Agent Work Queue" view for available tasks
- Respect priority order (P0 > P1 > P2 > P3)
- Skip blocked items (check Blocked By field)
- Prefer tasks matching session capacity (Effort field)

### Status Updates

- Update status immediately when starting work
- Comment with 🤖 prefix for agent activity
- Link PRs to issues using "Fixes #N" or "Part of #N"

### Research Protocol

- Create Research-type issues for new papers
- Include arXiv link in Research Paper field
- Move through Research Pipeline as insights are extracted
- Create Feature issues to implement techniques
```

---

## Quick Health Check

Run this checklist weekly:

- [ ] No items stuck in "In Progress" > 5 days without activity
- [ ] No P0 items in Backlog (should be Ready or In Progress)
- [ ] All items in Ready have Priority and Effort set
- [ ] No orphaned items (missing Type field)
- [ ] Research Pipeline has movement (not stagnant)
- [ ] Public Roadmap is coherent for external viewers
- [ ] Blocked Items view is empty or has clear unblock plans
