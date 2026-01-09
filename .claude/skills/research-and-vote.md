---
name: research-and-vote
description: |
  Research a topic using multiple sources and conduct multi-agent voting.
  Use when making architectural decisions, choosing dependencies, or
  designing APIs. Triggers on "research", "decide", "vote on", "consensus".
allowed-tools: Read, Grep, Glob, WebSearch, WebFetch, Task
context: fork
---

# Research and Vote Skill

## Purpose

Conduct thorough research on a topic and facilitate multi-agent consensus voting.

## Process

### Phase 1: Research

1. **Verify Time Context**

   ```bash
   TZ='America/New_York' date  # Record current ET time
   ```

2. **Gather Primary Sources**
   - Official documentation
   - Current specifications
   - Version/deprecation status
   - Security advisories

3. **Document Findings**
   - Create research summary
   - Link to sources
   - Note any `Verify:` items

### Phase 2: Proposal

1. **Draft Proposal Document**
   - Problem statement
   - Proposed solution
   - Alternatives considered
   - Trade-offs
   - Implementation approach

### Phase 3: Voting

1. **Spawn Voting Agents**
   - Architect: Architecture implications
   - Security: Security concerns
   - DevEx: Developer experience
   - PM: Timeline and scope impact

2. **Collect Votes**
   - Each agent: APPROVE / DISSENT / ABSTAIN
   - Require reasoning for each vote
   - Collect any amendments

3. **Determine Outcome**
   - Reversible decisions: Simple majority
   - Architecture: Supermajority (4/5)
   - Security-critical: Unanimous

### Phase 4: Documentation

1. **Record Decision**
   - Create GitHub issue or update existing
   - Document final decision
   - Record dissenting opinions
   - Link to implementation tasks

## Output Format

```markdown
# Decision Record: [Topic]

## Date

[Current ET date/time]

## Status

[Approved/Rejected/Needs Revision]

## Context

[Problem being solved]

## Research Summary

[Key findings from research phase]

## Decision

[Final decision made]

## Voting Record

| Agent     | Vote | Reasoning |
| --------- | ---- | --------- |
| Architect | ...  | ...       |

## Consequences

[What this decision means for the project]
```
