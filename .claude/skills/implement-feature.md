---
name: implement-feature
description: |
  Implement a new feature following project standards.
  Use when adding functionality, creating new modules, or extending capabilities.
  Triggers on "implement", "add feature", "create", "build".
allowed-tools: Read, Edit, Write, Bash, Grep, Glob, Task
---

# Implement Feature Skill

## Purpose

Implement features following coding standards, TDD, and proper documentation.

## Pre-Implementation Checklist

### 1. Verify Context

```bash
# Current time (ET)
TZ='America/New_York' date

# Current branch
git branch --show-current

# Clean working directory
git status
```

### 2. Check/Create GitHub Issue

```bash
# List existing issues
gh issue list --state open

# Create if needed
gh issue create \
  --title "feat: [Feature Name]" \
  --body "## Description\n\n## Acceptance Criteria\n\n## Tasks" \
  --label "enhancement"
```

### 3. Dependency Check

- Are new dependencies needed?
- If yes, run version-check skill first
- Document in issue

## Implementation Process

### Phase 1: Interface Definition

Before any implementation:

1. **Define Module Boundary**
   ```
   Module: [name]
   Responsibility: [single sentence]
   Owns: [data/state]
   Does not know: [other modules]
   ```

2. **Define Interface**
   ```typescript
   // Create interface FIRST
   interface IFeature {
     method(input: Input): Promise<Result<Output, Error>>;
   }
   ```

3. **Document in Issue**
   - Add interface definition
   - Get approval if major change

### Phase 2: Test First (TDD)

1. **Write Failing Test**
   ```typescript
   describe('Feature', () => {
     it('should [expected behavior]', () => {
       // Arrange
       // Act
       // Assert - this should FAIL initially
     });
   });
   ```

2. **Run Test**
   ```bash
   pnpm test -- --watch
   ```

### Phase 3: Implementation

1. **Implement to Pass Tests**
   - Follow coding standards
   - Files ≤ 400 lines
   - Functions ≤ 50 lines

2. **Run Quality Gates**
   ```bash
   pnpm lint
   pnpm typecheck
   pnpm test
   ```

3. **Verify Coverage**
   ```bash
   pnpm test:coverage
   ```

### Phase 4: Documentation

1. **Update JSDoc**
   - All public methods documented
   - Parameters and return types described

2. **Update README if needed**
   - New features documented
   - Examples provided

### Phase 5: Commit and PR

1. **Commit with Conventional Format**
   ```bash
   git add .
   git commit -m "feat(scope): description

   - Detail 1
   - Detail 2

   Closes #[issue-number]"
   ```

2. **Create PR**
   ```bash
   gh pr create \
     --title "feat(scope): description" \
     --body "## Summary\n\nCloses #[issue]\n\n## Changes\n\n## Testing"
   ```

## Quality Checklist

Before PR:
- [ ] All tests pass
- [ ] Coverage ≥ 80%
- [ ] Lint clean
- [ ] Types clean
- [ ] No files > 400 lines
- [ ] No functions > 50 lines
- [ ] Interface defined first
- [ ] JSDoc complete
- [ ] Issue linked
