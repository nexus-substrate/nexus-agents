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

- [CONTRIBUTION_GUIDE.md](../../../docs/development/CONTRIBUTION_GUIDE.md)
- [Research CONTRIBUTING.md](../../../docs/research/CONTRIBUTING.md)

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

Follow [CONTRIBUTION_GUIDE.md](../../../docs/development/CONTRIBUTION_GUIDE.md):

1. **Research** - Check registry, verify dependencies
2. **Interface First** - Define before implementation
3. **TDD** - Write failing test, implement, refactor
4. **Registry Update** - Change `status: planned` → `status: implemented`
5. **Commit** - Reference issue, update registry

## Quality Checklist

See [CODING_STANDARDS.md](../../../CODING_STANDARDS.md#10-quality-gates):

- [ ] Tests pass, lint/types clean
- [ ] Coverage ≥ 80%
- [ ] Registry updated (if technique)
- [ ] Issue referenced in commit
