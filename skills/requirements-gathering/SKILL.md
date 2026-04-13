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
