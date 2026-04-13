---
name: implement-feature
description: |
  Implement a new feature following project standards.
  Use when adding functionality, creating new modules, or extending capabilities.
  Triggers on "implement", "add feature", "create", "build".
allowed-tools: Read, Edit, Write, Bash, Grep, Glob, Task
---

# Implement Feature Skill

<!-- CANONICAL SOURCES:
  - CLAUDE.md Workflow Templates
  - docs/development/CONTRIBUTION_GUIDE.md
  - CODING_STANDARDS.md
-->

**Full workflow:** [CONTRIBUTION_GUIDE.md](../../../docs/development/CONTRIBUTION_GUIDE.md#workflow-feature-implementation)

## Pre-Implementation Checklist

1. **Verify context:** `TZ='America/New_York' date && git status`
2. **Check/create GitHub issue:** `gh issue list --state open`
3. **Check research registry** if implementing a technique

## Implementation Process

### Phase 1: Interface First

```typescript
// Define interface FIRST
interface IFeature {
  method(input: Input): Promise<Result<Output, Error>>;
}
```

See [CONTRIBUTION_GUIDE.md](../../../docs/development/CONTRIBUTION_GUIDE.md) for boundary checklist.

### Phase 2: TDD

1. Write failing test
2. Run: `pnpm test -- --watch`
3. Implement to pass

### Phase 3: Quality Gates

```bash
pnpm lint && pnpm typecheck && pnpm test
```

### Phase 4: Commit and PR

```bash
git commit -m "feat(scope): description

Closes #<issue>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"

gh pr create --title "feat(scope): description" --base main
```

## Quality Checklist

See [CODING_STANDARDS.md](../../../CODING_STANDARDS.md#10-quality-gates) for full checklist.

- [ ] Tests pass, coverage ≥ 80%
- [ ] Lint and types clean
- [ ] Files ≤ 400 lines, functions ≤ 50 lines
- [ ] Interface defined first

## Implementation Complete Checklist

Before marking ANY technique or feature as "implemented", verify ALL of the following:

### Code Requirements

- [ ] Code exists in specified `integration_files`
- [ ] All functions have explicit return types
- [ ] No `any` types (use `unknown` instead)

### Quality Gates

- [ ] `pnpm lint` passes with zero errors
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (relevant tests)

### Documentation Updates (if research-related)

- [ ] `docs/research/registry/techniques.yaml`: `status: implemented`, `decision_history` entry
- [ ] `docs/research/registry/papers.yaml`: `implementation_status` updated
- [ ] `docs/research/RESEARCH_INDEX.md`: Quick Stats updated if counts changed

### GitHub Tracking

- [ ] Implementation issue closed with summary comment
- [ ] PR merged (if applicable)

**Do NOT mark as implemented if:** tests fail, implementation is partial, or feature is behind a flag.
