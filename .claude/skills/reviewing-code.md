---
name: reviewing-code
description: |
  Review code changes following project standards and security guidelines.
  Checks for lint compliance, type safety, test coverage, and security issues.
  Use when reviewing PRs, auditing code, or checking implementation quality.
  Triggers on "review code", "code review", "check this", "audit", "PR review".
allowed-tools: Read, Grep, Glob, Bash, LSP
---

# Code Review Skill

Review code following CODING_STANDARDS.md and security guidelines.

## Review Checklist

### 1. Structural Compliance

| Criterion             | Limit       | Check Command     |
| --------------------- | ----------- | ----------------- |
| File length           | ≤ 400 lines | `wc -l <file>`    |
| Function length       | ≤ 50 lines  | Manual inspection |
| Cyclomatic complexity | ≤ 10        | ESLint reports    |
| Max parameters        | ≤ 5         | Manual inspection |
| Nesting depth         | ≤ 4         | Manual inspection |

### 2. Type Safety

- [ ] No `any` types (use `unknown`)
- [ ] `Result<T, E>` for fallible operations
- [ ] Zod validation at boundaries
- [ ] Discriminated unions over optional fields
- [ ] Proper null checks with `noUncheckedIndexedAccess`

### 3. Security Checks

- [ ] No secrets in code or logs
- [ ] Input validation on all boundaries
- [ ] Path traversal prevention on file ops
- [ ] No user-provided RegExp (ReDoS risk)
- [ ] Rate limiting on public interfaces
- [ ] Memory bounds on collections

### 4. Test Coverage

```bash
# Run tests with coverage
pnpm test:coverage

# Check coverage thresholds
# Lines: ≥ 80%
# Branches: ≥ 75%
# Critical paths: 100%
```

### 5. Quality Gates

```bash
# All must pass
pnpm lint      # Zero errors, zero warnings
pnpm typecheck # Zero type errors
pnpm test      # All tests pass
```

## Review Process

### Step 1: Understand Context

```bash
# View changed files
git diff --stat HEAD~1

# Read the changes
git diff HEAD~1

# Check related issue
gh issue view <number>
```

### Step 2: Run Automated Checks

```bash
pnpm lint && pnpm typecheck && pnpm test
```

### Step 3: Manual Review

Focus on:

1. **Logic correctness** - Does it do what it claims?
2. **Edge cases** - Are errors handled?
3. **Performance** - Any obvious bottlenecks?
4. **Maintainability** - Will this be clear in 6 months?

### Step 4: Security Deep Dive

For security-sensitive code:

- Authentication/authorization logic
- Input parsing and validation
- File system operations
- External API calls
- Data serialization

## Review Output Format

```markdown
## Code Review: [File/PR]

### Summary

[1-2 sentence overview]

### Findings

#### Critical (Must Fix)

- [ ] Issue 1: [description] at `file:line`

#### Major (Should Fix)

- [ ] Issue 1: [description]

#### Minor (Consider)

- [ ] Suggestion 1: [description]

### Positive Observations

- [What's done well]

### Recommendation

[ ] APPROVE - Ready to merge
[ ] REQUEST_CHANGES - Issues must be addressed
[ ] COMMENT - Discussion needed
```

## Common Issues

### Type Safety

```typescript
// Bad: any type
function process(data: any) {}

// Good: unknown with validation
function process(data: unknown) {
  const validated = Schema.safeParse(data);
  if (!validated.success) return { ok: false, error: validated.error };
}
```

### Error Handling

```typescript
// Bad: throwing without context
throw new Error('Failed');

// Good: Result type with context
return { ok: false, error: new ProcessError('Failed to parse', { input }) };
```

### File Operations

```typescript
// Bad: direct path usage
fs.readFileSync(userPath);

// Good: validated path
const validated = validatePath(userPath, allowedRoot);
if (!validated.ok) return validated;
fs.readFileSync(validated.value);
```
