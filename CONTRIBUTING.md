# Contributing to Nexus Agents

This guide covers development setup, coding standards, and the contribution workflow for Nexus Agents.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment. Please be considerate in your interactions with other contributors.

---

## Development Setup

### Prerequisites

Before you begin, ensure you have the following installed:

| Tool            | Version  | Purpose                 |
| --------------- | -------- | ----------------------- |
| Node.js         | 22.x LTS | Runtime environment     |
| pnpm            | 9.x      | Package manager         |
| Git             | Latest   | Version control         |
| GitHub CLI (gh) | Latest   | Issue and PR management |

Verify your setup:

```bash
node --version    # Should output v22.x.x
pnpm --version    # Should output 9.x.x
git --version     # Any recent version
gh --version      # Any recent version
```

### Clone and Install

1. **Fork the repository** on GitHub

2. **Clone your fork:**

   ```bash
   git clone https://github.com/<your-username>/nexus-agents.git
   cd nexus-agents
   ```

3. **Add upstream remote:**

   ```bash
   git remote add upstream https://github.com/williamzujkowski/nexus-agents.git
   ```

4. **Install dependencies:**

   ```bash
   pnpm install
   ```

### Build and Test Commands

```bash
# Development
pnpm dev              # Start development server
pnpm build            # Build all packages
pnpm test             # Run tests
pnpm test:coverage    # Run tests with coverage report

# Code Quality
pnpm lint             # Lint all files
pnpm lint:fix         # Auto-fix linting issues
pnpm typecheck        # Run TypeScript type checking
```

---

## Development Workflow

### Branch Naming Conventions

Use the following prefixes for your branches:

| Prefix      | Use Case               | Example                            |
| ----------- | ---------------------- | ---------------------------------- |
| `feat/`     | New features           | `feat/123-add-workflow-engine`     |
| `fix/`      | Bug fixes              | `fix/456-memory-leak-fix`          |
| `docs/`     | Documentation changes  | `docs/update-api-reference`        |
| `refactor/` | Code refactoring       | `refactor/extract-result-type`     |
| `test/`     | Test additions/changes | `test/add-agent-integration-tests` |
| `chore/`    | Maintenance tasks      | `chore/update-dependencies`        |

Always include the issue number when one exists: `feat/<issue-number>-short-description`

### Commit Message Format

We use [Conventional Commits](https://www.conventionalcommits.org/). Each commit message should follow this format:

```
type(scope): description

[optional body]

[optional footer]
```

**Types:**

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation only
- `refactor` - Code change that neither fixes a bug nor adds a feature
- `test` - Adding or updating tests
- `chore` - Maintenance tasks
- `perf` - Performance improvement

**Examples:**

```bash
# Feature commit
git commit -m "feat(agents): add dynamic expert creation

- Implement ExpertFactory for on-demand agent creation
- Add role-based configuration system
- Support custom tool assignments

Closes #123"

# Bug fix commit
git commit -m "fix(mcp): prevent path traversal in file operations

Resolves security vulnerability in read_files tool.

Closes #456"

# Documentation commit
git commit -m "docs(api): update tool reference documentation"
```

### Pull Request Process

1. **Create a branch** from the latest `main`:

   ```bash
   git checkout main
   git pull upstream main
   git checkout -b feat/123-your-feature
   ```

2. **Make your changes** following our coding standards (see below)

3. **Run quality gates** before committing:

   ```bash
   pnpm lint
   pnpm typecheck
   pnpm test
   ```

4. **Push your branch:**

   ```bash
   git push -u origin feat/123-your-feature
   ```

5. **Create a Pull Request:**

   ```bash
   gh pr create \
     --title "feat(scope): your feature description" \
     --body "## Summary
   - Implements #123

   ## Changes
   - List of changes

   ## Testing
   - How you tested this" \
     --base main
   ```

6. **Address review feedback** and ensure CI passes

7. **Merge** (maintainers will squash-merge approved PRs)

---

## Code Quality Standards

All contributions must adhere to our coding standards. For complete details, see [CODING_STANDARDS.md](./CODING_STANDARDS.md).

### Key Requirements

#### File and Function Limits

| Metric                  | Limit         |
| ----------------------- | ------------- |
| File length             | 400 lines max |
| Function length         | 50 lines max  |
| Cyclomatic complexity   | 10 max        |
| Parameters per function | 5 max         |
| Nesting depth           | 4 levels max  |

These limits are enforced by ESLint and will cause CI to fail if exceeded.

#### TypeScript Requirements

- Use `strict` mode
- Use `unknown` instead of `any`
- Use `Result<T, E>` pattern for fallible operations
- Define interfaces before implementations
- Use Zod for runtime validation at boundaries

#### Naming Conventions

| Type       | Convention            | Example             |
| ---------- | --------------------- | ------------------- |
| Interfaces | `I` prefix            | `IModelAdapter`     |
| Types      | PascalCase            | `CompletionRequest` |
| Functions  | camelCase, verb-first | `createAdapter`     |
| Constants  | SCREAMING_SNAKE       | `MAX_RETRIES`       |
| Files      | kebab-case            | `model-adapter.ts`  |

### Quality Gates

All code must pass these checks before merge:

- [ ] `pnpm lint` - Zero errors, zero warnings
- [ ] `pnpm typecheck` - Zero type errors
- [ ] `pnpm test` - All tests pass
- [ ] Coverage >= 80%
- [ ] No secrets in code

---

## Testing Guidelines

### Coverage Requirements

| Type            | Target |
| --------------- | ------ |
| Line coverage   | >= 80% |
| Branch coverage | >= 75% |
| Critical paths  | 100%   |

Critical paths include: security, validation, and error handling code.

### Test Structure

We use Vitest for testing. Follow this structure:

```typescript
import { describe, it, expect } from 'vitest';

describe('ModuleName', () => {
  describe('functionName', () => {
    it('should handle expected input correctly', () => {
      // Arrange
      const input = {
        /* ... */
      };

      // Act
      const result = functionName(input);

      // Assert
      expect(result.ok).toBe(true);
    });

    it('should return error for invalid input', () => {
      // Arrange
      const invalidInput = {
        /* ... */
      };

      // Act
      const result = functionName(invalidInput);

      // Assert
      expect(result.ok).toBe(false);
      expect(result.error).toMatchObject({
        /* ... */
      });
    });
  });
});
```

### Test Categories

1. **Unit tests** - Isolated tests with mocked dependencies
2. **Integration tests** - Test module boundaries with real dependencies
3. **Contract tests** - Verify interface compliance
4. **Security tests** - Test for path traversal, injection, etc.

### Running Tests

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run specific test file
pnpm test packages/core/src/utils.test.ts

# Run in watch mode
pnpm test --watch
```

---

## Documentation Requirements

### When to Update Documentation

- Adding new features or tools
- Changing public APIs
- Modifying configuration options
- Updating dependencies with breaking changes

### Documentation Standards

- Keep documentation close to the code it describes
- Use JSDoc comments for public functions and interfaces
- Include examples in documentation
- Update the CHANGELOG.md for user-facing changes

### JSDoc Example

````typescript
/**
 * Creates a new expert agent with the specified role and capabilities.
 *
 * @param config - Configuration for the expert agent
 * @param config.role - The role type (e.g., 'architect', 'reviewer')
 * @param config.tools - Array of tool names the agent can use
 * @returns Result containing the created agent or an error
 *
 * @example
 * ```typescript
 * const result = await createExpert({
 *   role: 'architect',
 *   tools: ['read_files', 'analyze_code']
 * });
 *
 * if (result.ok) {
 *   const agent = result.value;
 * }
 * ```
 */
````

---

## Issue Reporting Guidelines

### Before Creating an Issue

1. Search existing issues to avoid duplicates
2. Check the documentation for answers
3. Verify you're using the latest version

### Bug Reports

Use the bug report template:

```markdown
## Bug Description

A clear description of what the bug is.

## Steps to Reproduce

1. Step one
2. Step two
3. Step three

## Expected Behavior

What you expected to happen.

## Actual Behavior

What actually happened.

## Environment

- Node.js version:
- pnpm version:
- OS:

## Additional Context

Any other relevant information (logs, screenshots, etc.)
```

Create a bug report:

```bash
gh issue create \
  --title "fix: brief description of the bug" \
  --label "bug"
```

### Feature Requests

Use the feature request template:

```markdown
## Feature Description

A clear description of the feature you'd like.

## Use Case

Why do you need this feature? What problem does it solve?

## Proposed Solution

How do you think this should work?

## Alternatives Considered

What other approaches have you considered?

## Additional Context

Any other relevant information.
```

Create a feature request:

```bash
gh issue create \
  --title "feat: brief description of the feature" \
  --label "enhancement"
```

### Issue Labels

| Label              | Description                               |
| ------------------ | ----------------------------------------- |
| `bug`              | Something isn't working                   |
| `enhancement`      | New feature or request                    |
| `tech-debt`        | Code improvements without feature changes |
| `security`         | Security-related issues                   |
| `research`         | Research tasks requiring investigation    |
| `documentation`    | Documentation improvements                |
| `good-first-issue` | Good for newcomers                        |

---

## Security Issues

If you discover a security vulnerability, please **do not** create a public issue. Instead:

1. Create an issue with the `security` label
2. Do not include specific vulnerability details in the public issue
3. Wait for maintainer response with secure communication channel

---

## Getting Help

- Review the [CLAUDE.md](./CLAUDE.md) for project architecture
- Check [CODING_STANDARDS.md](./CODING_STANDARDS.md) for detailed standards
- Open a discussion for questions
- Join our community channels (if available)

---

## Recognition

Contributors are listed in the release notes.

---

_Last updated: 2026-01-04 (ET)_
