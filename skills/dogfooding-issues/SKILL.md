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

<!-- CANONICAL SOURCES:
  - CLAUDE.md Workflow Templates
  - docs/research/CONTRIBUTING.md
  - docs/development/CONTRIBUTION_GUIDE.md
-->

Process open issues following the self-development protocol.

**Full workflows:**

- [CONTRIBUTION_GUIDE.md](../../docs/development/CONTRIBUTION_GUIDE.md)
- [Research CONTRIBUTING.md](../../docs/research/CONTRIBUTING.md)

## Pre-Flight Checks

```bash
TZ='America/New_York' date '+%Y-%m-%d %H:%M:%S %Z'
git status --short
gh issue list --state open --limit 20
```

## Issue Selection

### Check Research Registry First

```bash
grep -A 5 "status: planned" docs/research/registry/techniques.yaml | \
  grep -B 5 "priority: P[12]"
```

Priority order:

1. P1 techniques with existing issues
2. P2 techniques with clear implementation path
3. Bug fixes blocking other work
4. Documentation gaps

## Implementation

Follow [CONTRIBUTION_GUIDE.md](../../docs/development/CONTRIBUTION_GUIDE.md):

1. **Research** - Check registry, verify dependencies
2. **Interface First** - Define before implementation
3. **TDD** - Write failing test, implement, refactor
4. **Registry Update** - Change `status: planned` → `status: implemented`
5. **Commit** - Reference issue, update registry

## Quality Checklist

See [CODING_STANDARDS.md](../../CODING_STANDARDS.md#10-quality-gates):

- [ ] Tests pass, lint/types clean
- [ ] Coverage ≥ 80%
- [ ] Registry updated (if technique)
- [ ] Issue referenced in commit

## Anti-rationalization — Dogfooding

| Excuse                                                   | Counter                                                                                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| "Pick the easy issue first"                              | Easy + un-implemented is suspicious — usually means the issue isn't actually easy or the spec is wrong. Pick by impact, not by ease. |
| "Skip the research check"                                | The research registry is where prior thought lives. Skipping it means re-deriving solutions and missing prior decisions.             |
| "Test coverage 80% is fine"                              | Per CLAUDE.md, the gate is 89.66% / 93.26% (statement / function). Don't ship below the existing floor.                              |
| "Implementation is partial — flag mark as 'in progress'" | Per implement-feature: don't mark implemented if partial. Either ship the slice or split the issue.                                  |

## Red flags

- Issue closed with PR linked but feature behind a flag
- Research registry entry not updated to `status: implemented`
- Test count dropped after the implementation (lost coverage)
- Issue spawned >5 follow-up issues (scope creep — should have split)

## Verification checklist

- [ ] Research registry checked first
- [ ] Tests pass at the existing coverage gate (89.66% / 93.26%)
- [ ] Feature complete (not partial, not flag-gated unless flag is the design)
- [ ] Research registry status updated to `implemented`
- [ ] Issue closed with summary linking the PR
