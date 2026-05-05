---
name: requirements-gathering
description: |
  Extract structured requirements from vague user requests. Decompose ideas
  into user stories with acceptance criteria, map to available capabilities,
  and identify gaps. Triggers on "requirements", "user stories", "what do I need",
  "break down this request", "analyze this feature".
allowed-tools: Read, Grep, Glob, WebSearch, Task
context: fork
---

# Requirements Gathering Skill

<!-- CANONICAL SOURCES:
  - CLAUDE.md Canonical Paths
  - docs/ENTRYPOINTS.md
  - Epic #901 (User Advocate Pipeline)
-->

## Process

### Phase 1: Analyze the Request

1. Parse the user's raw input for intent, scope, and stakeholders
2. Identify ambiguities — what's unclear or underspecified?
3. Classify the request type: feature, improvement, fix, research, infrastructure
4. Assess complexity: simple (1-2 steps), moderate (3-5), complex (6+)

### Phase 2: Extract Requirements

Structure findings as:

**Functional Requirements** — What the system must do
**Non-functional Requirements** — Performance, security, usability constraints
**Constraints** — Technical limitations, timeline, dependencies

### Phase 3: Map to Capabilities

Cross-reference requirements against available nexus-agents capabilities:

| Capability Type   | Where to Check                        |
| ----------------- | ------------------------------------- |
| MCP Tools (20)    | CLAUDE.md MCP Tools Reference table   |
| Workflows (9)     | `src/orchestration/graph/templates/`  |
| Expert Roles (9)  | `src/agents/experts/expert-config.ts` |
| CLI Adapters      | `src/cli-adapters/factory.ts`         |
| Security Pipeline | `src/security/`                       |

### Phase 4: Identify Gaps

For each requirement that cannot be fulfilled:

- Describe the gap clearly
- Suggest workarounds using existing capabilities
- Flag for issue creation if the gap is significant

### Phase 5: Generate User Stories

Format each requirement as a user story:

```
As a [role], I want [capability] so that [benefit]

Acceptance Criteria:
- Given [context], When [action], Then [outcome]
- Given [context], When [action], Then [outcome]

Priority: P1/P2/P3/P4
Dependencies: [list]
```

### Phase 6: Propose Plan

Summarize the implementation approach:

1. Which existing tools/workflows/experts to use
2. What new capabilities need to be built
3. Suggested phasing (what to build first)
4. Risk assessment

## Output Format

```markdown
## Requirements Analysis

### Intent

[1-2 sentence summary of what the user wants]

### User Stories

1. **[Story Title]**
   As a [role], I want [capability] so that [benefit]
   - AC: [acceptance criteria]
   - Priority: [P1-P4]

### Capability Mapping

| Requirement | Available Tool/Workflow | Status          |
| ----------- | ----------------------- | --------------- |
| [req]       | [tool/workflow/expert]  | [available/gap] |

### Gaps Identified

- [Gap description + suggested workaround]

### Recommended Approach

[Phased implementation plan using existing capabilities]
```

## When to Use

- User describes a feature vaguely ("make it do X")
- Planning a new epic or large feature
- Evaluating whether a request is feasible with current capabilities
- Bridging between user intent and technical implementation

## Divergent → Convergent thinking

For ambiguous or open-ended requests, run a structured ideation pass before settling on requirements:

### Step 1 — Diverge

Restate the idea in your own words, then ask three sharpening questions:

1. **What problem does this actually solve?** Often the request describes a solution, not the problem.
2. **Who is harmed if we don't do this?** Identifies the real stakeholder.
3. **What would success look like at the end of the first hour of use?** Concretizes the acceptance criterion.

Then generate 2-3 variations of the request — different scopes, different users, different mechanisms.

### Step 2 — Converge

For each variation:

- **Cluster** — what assumptions does this share with the others?
- **Stress-test** — what's the failure mode? What if the assumption is wrong?
- **Surface hidden constraints** — what is the user assuming we already know? (Tech stack, deadlines, audience, success metrics)

### Step 3 — Sharpen and ship

Produce a one-pager with: Problem statement, Recommended direction, Key assumptions, MVP scope, **Not Doing** list. The Not Doing list is the highest-value section — it makes scope decisions explicit.

## Dependency-graph identification

When the request becomes a multi-task plan, map dependencies before sequencing:

1. **List the tasks.**
2. **For each task, identify what must exist before it can run** (schemas, APIs, data, other modules, tests, docs).
3. **Identify parallel-safe tasks** — those with no shared dependencies.
4. **Identify serial bottlenecks** — single tasks that block many downstream items.

Sequence: serial bottlenecks first, then parallel-safe waves of 3-4 (per `.rules/subagent-coordination.md`), then late-stage integration tasks.

## Anti-rationalization — Requirements

| Excuse                                                        | Counter                                                                                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| "The user said X, so we build X"                              | Users describe solutions; you need the problem. Restate, ask the three sharpening questions.                             |
| "This is obvious, no need to write it down"                   | Obvious to whom? Different stakeholders read "obvious" differently. The Not Doing list catches the silent disagreements. |
| "We can figure out scope as we go"                            | Scope creep is the most expensive bug. Lock the MVP and the Not Doing list before writing code.                          |
| "The acceptance criterion is 'when it works'"                 | "Works" is unfalsifiable. The criterion is a test or a user scenario the spec can be measured against.                   |
| "We don't need to identify dependencies, we'll just hit them" | Hitting dependencies serial costs ~Nx the time vs identified-and-parallelized. Map first, then sequence.                 |
