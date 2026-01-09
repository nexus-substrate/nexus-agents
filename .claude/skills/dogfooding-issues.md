---
name: dogfooding-issues
description: |
  Process open GitHub issues using the self-development protocol.
  Implements features from research registry with proper voting and testing.
  Use when working on open issues, implementing research techniques, or
  following the dogfooding workflow. Triggers on "dogfood", "work on issues",
  "implement issue", "self-development", "process issues".
allowed-tools: Read, Edit, Write, Bash, Grep, Glob, Task, WebSearch, WebFetch
---

# Dogfooding Issues Skill

Process open issues following the self-development protocol.

## Pre-Flight Checks

```bash
# Verify time (ET)
TZ='America/New_York' date '+%Y-%m-%d %H:%M:%S %Z'

# Check git status
git status --short

# List open issues
gh issue list --state open --limit 20
```

## Issue Selection Protocol

### 1. Check Research Registry

```bash
# Find P1/P2 techniques ready for implementation
grep -A 5 "status: planned" docs/research/registry/techniques.yaml | \
  grep -B 5 "priority: P[12]"

# Check for existing overlap
grep -ri "technique-name" packages/nexus-agents/src/
```

### 2. Select Issue

Priority order:

1. P1 techniques with existing issues
2. P2 techniques with clear implementation path
3. Bug fixes blocking other work
4. Documentation gaps

### 3. Verify No Conflicts

```bash
# Check if someone is working on it
gh issue view <number> --json assignees,comments
```

## Implementation Workflow

### Phase 1: Research

1. **Read the issue thoroughly**
2. **Check research registry** for related papers/techniques
3. **Verify dependencies** are current (use version-check skill if needed)
4. **Document approach** in issue comments

### Phase 2: Interface First

Before implementation:

```typescript
// Define interface FIRST
interface IFeatureName {
  method(input: Input): Promise<Result<Output, Error>>;
}
```

### Phase 3: TDD Implementation

1. **Write failing test**
2. **Implement to pass**
3. **Refactor if needed**
4. **Run quality gates**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

### Phase 4: Registry Update

After implementation:

```bash
# Update technique status
# In docs/research/registry/techniques.yaml
# Change: status: planned -> status: implemented
# Add decision_history entry with date
```

### Phase 5: Commit and Close

```bash
git add .
git commit -m "feat(scope): description

- Implementation details
- Test coverage

Closes #<issue-number>

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"

git push origin main
```

## Quality Checklist

Before closing issue:

- [ ] All tests pass
- [ ] Lint clean
- [ ] Types clean
- [ ] Coverage maintained (≥80%)
- [ ] Registry updated (if technique)
- [ ] Issue referenced in commit
- [ ] No files > 400 lines
- [ ] No functions > 50 lines

## Voting (If Required)

For architectural decisions, use research-and-vote skill:

- Spawn voting agents: Architect, Security, DevEx, PM
- Threshold: Supermajority (4/5) for architecture
- Document decision in issue

## Error Recovery

If implementation fails:

1. Document what went wrong in issue comment
2. Create sub-issue if scope too large
3. Update technique status to "blocked" with reason
4. Ask for guidance if stuck
