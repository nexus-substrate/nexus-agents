# Contribution Guide

**Tier 3** | Detailed contribution workflow and standards
**Hub:** [README.md](./README.md) | **Quick Start:** [CONTRIBUTING.md](../../CONTRIBUTING.md)

---

## Overview

This guide provides detailed contribution workflows for nexus-agents. For quick setup, see [CONTRIBUTING.md](../../CONTRIBUTING.md).

---

## Development Setup

### Prerequisites

| Tool            | Version  | Purpose                 |
| --------------- | -------- | ----------------------- |
| Node.js         | 22.x LTS | Runtime environment     |
| pnpm            | 9.x      | Package manager         |
| Git             | Latest   | Version control         |
| GitHub CLI (gh) | Latest   | Issue and PR management |

### Installation

```bash
# Clone repository
git clone https://github.com/williamzujkowski/nexus-agents.git
cd nexus-agents

# Install dependencies
pnpm install

# Verify installation
pnpm test
```

---

## Workflow: Feature Implementation

### Step 1: Research and Plan

Before implementing:

1. **Check existing issues** - Avoid duplicate work
2. **Research registry** - Check `docs/research/registry/techniques.yaml`
3. **Define interface** - Write interface before implementation

```bash
# Search for related issues
gh issue list --search "keyword"

# Check research registry
grep -i "keyword" docs/research/registry/techniques.yaml
```

### Step 2: Create GitHub Issue

```bash
gh issue create \
  --title "feat: brief description" \
  --body "## Description

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Related Research
- Link to paper or technique" \
  --label "enhancement"
```

### Step 3: Create Branch

```bash
git checkout main
git pull origin main
git checkout -b feat/<issue>-short-description
```

### Step 4: Implement with TDD

```bash
# Write failing test first
pnpm test --watch packages/nexus-agents/src/path/to/feature.test.ts

# Implement until tests pass
# Keep functions < 50 lines, files < 400 lines
```

### Step 5: Run Quality Gates

```bash
pnpm lint          # Zero errors, zero warnings
pnpm typecheck     # Zero type errors
pnpm test          # All tests pass
```

### Step 6: Commit with Conventional Format

```bash
git add .
git commit -m "$(cat <<'EOF'
feat(scope): brief description

- Implementation detail 1
- Implementation detail 2

Closes #<issue>

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

### Step 7: Create Pull Request

```bash
git push -u origin HEAD
gh pr create \
  --title "feat(scope): description" \
  --body "## Summary
- Implements #<issue>

## Changes
- Change 1
- Change 2

## Testing
- Test approach

## Checklist
- [ ] Tests pass
- [ ] Lint clean
- [ ] Types clean"
```

---

## Workflow: Bug Fix

### Step 1: Reproduce

```bash
# Create minimal reproduction
pnpm test:watch packages/nexus-agents/src/path/to/failing.test.ts
```

### Step 2: Write Failing Test

```typescript
it('should not have the bug', () => {
  const result = buggyFunction(input);
  expect(result).toBe(expected);
});
```

### Step 3: Fix and Verify

```bash
# Implement fix until test passes
# Check for similar bugs elsewhere
grep -r "similar-pattern" packages/
```

### Step 4: Create PR with Bug Fix Format

```bash
git commit -m "$(cat <<'EOF'
fix(scope): brief description of fix

Fixes regression where X caused Y.

Closes #<issue>

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Workflow: Documentation

### When to Update Documentation

- Adding new features or tools
- Changing public APIs
- Modifying configuration options
- Fixing incorrect documentation

### Documentation Checklist

- [ ] JSDoc for public functions
- [ ] Update relevant `docs/*.md` files
- [ ] Update CHANGELOG.md for user-facing changes
- [ ] Verify links work: `pnpm lint:links`

---

## PR Review Process

### CLI-Based Review (Required)

```bash
# Run review with auto-selected CLI
pnpm review <PR-number>

# Use specific model
pnpm review <PR#> --model=claude    # Security, architecture
pnpm review <PR#> --model=gemini    # Large files (1M context)
pnpm review <PR#> --model=codex     # Code quality

# Dry run (preview without posting)
pnpm review <PR#> --dry-run
```

### Review Focus Areas

| Area        | Check For                              |
| ----------- | -------------------------------------- |
| Security    | Path traversal, injection, secrets     |
| TypeScript  | No `any`, Result<T,E>, Zod validation  |
| Testing     | Coverage, edge cases, mocked correctly |
| Standards   | File/function limits, naming           |
| Performance | No unbounded loops, memory leaks       |

---

## Commit Message Reference

### Types

| Type       | Use For                      |
| ---------- | ---------------------------- |
| `feat`     | New feature                  |
| `fix`      | Bug fix                      |
| `docs`     | Documentation only           |
| `refactor` | Code change (no feature/fix) |
| `test`     | Adding or updating tests     |
| `chore`    | Maintenance tasks            |
| `perf`     | Performance improvement      |

### Scopes

| Scope       | Package/Module             |
| ----------- | -------------------------- |
| `core`      | Core types, Result, errors |
| `agents`    | Agent framework, experts   |
| `mcp`       | MCP server, tools          |
| `cli`       | CLI commands               |
| `adapters`  | Model adapters             |
| `workflows` | Workflow engine            |
| `consensus` | Consensus protocols        |
| `memory`    | Memory systems             |
| `routing`   | CLI routing, budget        |
| `docs`      | Documentation              |

---

## Issue Labels Reference

| Label              | Description               |
| ------------------ | ------------------------- |
| `bug`              | Something isn't working   |
| `enhancement`      | New feature or request    |
| `tech-debt`        | Code improvement          |
| `security`         | Security-related          |
| `research`         | Research task             |
| `documentation`    | Documentation improvement |
| `good-first-issue` | Good for newcomers        |
| `P1` - `P4`        | Priority levels           |

---

## Quality Gates Reference

### Pre-Commit

- `pnpm lint` - Zero errors, zero warnings
- `pnpm typecheck` - Zero type errors
- `pnpm test` - All tests pass
- Files ≤ 400 lines
- Functions ≤ 50 lines

### Pre-Merge

- All pre-commit gates
- Coverage ≥ 80%
- Security audit clean
- No deprecated dependencies

### Pre-Release

- All pre-merge gates
- E2E tests pass
- Documentation complete
- CHANGELOG updated

---

## Related Documents

- **Quick Start:** [CONTRIBUTING.md](../../CONTRIBUTING.md)
- **Coding Standards:** [CODING_STANDARDS.md](../../CODING_STANDARDS.md)
- **Architecture:** [architecture/README.md](../architecture/README.md)
- **Research:** [RESEARCH_INDEX.md](../research/RESEARCH_INDEX.md)
