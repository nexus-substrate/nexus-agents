---
title: Contributing Guide
description: How to contribute to nexus-agents including setup, workflow, and coding standards.
---

This guide covers how to set up your development environment, contribute code, and follow project standards.

## Prerequisites

| Tool            | Version  | Purpose                 |
| --------------- | -------- | ----------------------- |
| Node.js         | 22.x LTS | Runtime environment     |
| pnpm            | 9.x      | Package manager         |
| Git             | Latest   | Version control         |
| GitHub CLI (gh) | Latest   | Issue and PR management |

Verify your environment:

```bash
node --version   # Must be v22.x
pnpm --version   # Must be v9.x
gh --version     # For issue/PR management
```

## Development Setup

### Clone and Install

```bash
# Clone repository
git clone https://github.com/williamzujkowski/nexus-agents.git
cd nexus-agents

# Install dependencies
pnpm install

# Verify installation
pnpm test
```

### Environment Variables

Create a `.env` file (not committed):

```bash
# Required for Claude models
ANTHROPIC_API_KEY=your-key

# Optional for other providers
OPENAI_API_KEY=your-key
GOOGLE_AI_API_KEY=your-key

# Development settings
NEXUS_LOG_LEVEL=debug
```

### Common Commands

```bash
# Development
pnpm dev              # Start dev server
pnpm build            # Build all packages
pnpm test             # Run tests
pnpm test:watch       # Watch mode

# Quality
pnpm lint             # Lint code
pnpm lint:fix         # Auto-fix lint issues
pnpm typecheck        # Type check

# Utilities
pnpm clean            # Clean build artifacts
```

## Contribution Workflow

### Step 1: Find or Create an Issue

Before starting work:

```bash
# Search for existing issues
gh issue list --search "keyword"

# Check research registry for related techniques
grep -i "keyword" docs/research/registry/techniques.yaml
```

Create an issue if one does not exist:

```bash
gh issue create \
  --title "feat: brief description" \
  --body "## Description

What needs to be done.

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2" \
  --label "enhancement"
```

### Step 2: Create a Branch

```bash
git checkout main
git pull origin main
git checkout -b feat/<issue-number>-short-description
```

**Branch naming conventions:**

- `feat/<issue>-description` - New features
- `fix/<issue>-description` - Bug fixes
- `refactor/description` - Code refactoring
- `docs/description` - Documentation

### Step 3: Implement with TDD

Write tests first:

```bash
# Watch mode for TDD
pnpm test:watch packages/nexus-agents/src/path/to/feature.test.ts
```

```typescript
// feature.test.ts
import { describe, it, expect } from 'vitest';
import { myFeature } from './feature.js';

describe('myFeature', () => {
  it('should handle the happy path', () => {
    const result = myFeature('input');
    expect(result.ok).toBe(true);
  });

  it('should handle errors gracefully', () => {
    const result = myFeature('');
    expect(result.ok).toBe(false);
  });
});
```

Then implement until tests pass.

### Step 4: Run Quality Gates

All must pass before commit:

```bash
pnpm lint          # Zero errors, zero warnings
pnpm typecheck     # Zero type errors
pnpm test          # All tests pass
```

### Step 5: Commit with Conventional Format

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

### Step 6: Create Pull Request

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
- How to test

## Checklist
- [ ] Tests pass
- [ ] Lint clean
- [ ] Types clean"
```

## Commit Message Format

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

### Examples

```bash
# Feature
feat(agents): add code expert with TypeScript support

# Bug fix
fix(routing): handle empty task descriptions

# Documentation
docs(api): update MCP tool documentation

# Refactoring
refactor(memory): extract common logic to base class
```

## Coding Standards

### TypeScript

```typescript
// Use Result<T, E> for fallible operations
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

// Use unknown over any
function parse(input: unknown): Result<Data, ParseError> {}

// Explicit return types
function calculate(x: number): number {
  return x * 2;
}

// Zod for runtime validation
const InputSchema = z.object({
  task: z.string().min(1),
  context: z.record(z.unknown()).optional(),
});
```

### File Limits

| Metric                | Limit     |
| --------------------- | --------- |
| File length           | 400 lines |
| Function length       | 50 lines  |
| Cyclomatic complexity | 10        |
| Parameters            | 5         |

### Naming Conventions

| Type       | Convention      | Example             |
| ---------- | --------------- | ------------------- |
| Interfaces | `I` prefix      | `IModelAdapter`     |
| Types      | PascalCase      | `CompletionRequest` |
| Functions  | camelCase       | `createAdapter`     |
| Constants  | SCREAMING_SNAKE | `MAX_RETRIES`       |
| Files      | kebab-case      | `model-adapter.ts`  |
| Tests      | `.test.ts`      | `adapter.test.ts`   |

## Quality Gates

### Pre-Commit (Required)

- `pnpm lint` passes with zero errors/warnings
- `pnpm typecheck` passes with zero errors
- `pnpm test` passes all tests
- Files are under 400 lines
- Functions are under 50 lines

### Pre-Merge (Required)

- All pre-commit gates pass
- Test coverage at least 80%
- Security audit clean
- No deprecated dependencies
- Documentation updated

### Pre-Release

- All pre-merge gates pass
- E2E tests pass
- Performance benchmarks pass
- CHANGELOG updated
- Version bumped

## PR Review Process

### Automated Review

PRs receive automated review via Claude Code Action:

```yaml
# .github/workflows/claude-review.yml
on:
  pull_request:
    types: [opened, synchronize]
```

### Review Focus Areas

| Area        | Check For                             |
| ----------- | ------------------------------------- |
| Security    | Path traversal, injection, secrets    |
| TypeScript  | No `any`, Result<T,E>, Zod validation |
| Testing     | Coverage, edge cases, mocks           |
| Standards   | File/function limits, naming          |
| Performance | No unbounded loops, memory leaks      |

## Issue Labels

| Label              | Description               |
| ------------------ | ------------------------- |
| `bug`              | Something is broken       |
| `enhancement`      | New feature or request    |
| `tech-debt`        | Code improvement          |
| `security`         | Security-related          |
| `documentation`    | Documentation improvement |
| `good-first-issue` | Good for newcomers        |
| `P1` - `P4`        | Priority levels           |

## Testing Guidelines

### Unit Tests

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('MyService', () => {
  it('should process valid input', () => {
    const result = service.process({ valid: true });
    expect(result.ok).toBe(true);
  });

  it('should reject invalid input', () => {
    const result = service.process({ valid: false });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('INVALID_INPUT');
  });
});
```

### Integration Tests

```typescript
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

describe('MCP Integration', () => {
  let client: Client;
  let server: Server;

  beforeEach(async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  it('should handle tool calls', async () => {
    const result = await client.callTool({
      name: 'orchestrate',
      arguments: { task: 'test' },
    });
    expect(result.isError).toBe(false);
  });
});
```

### Mocking

```typescript
import { vi } from 'vitest';

// Mock a module
vi.mock('./external-service', () => ({
  ExternalService: vi.fn().mockImplementation(() => ({
    call: vi.fn().mockResolvedValue({ data: 'mocked' }),
  })),
}));

// Spy on a method
const spy = vi.spyOn(service, 'method');
await service.method();
expect(spy).toHaveBeenCalled();
```

## Documentation

### When to Update Docs

- Adding new features or tools
- Changing public APIs
- Modifying configuration options
- Fixing incorrect documentation

### JSDoc Format

```typescript
/**
 * Creates a new model adapter.
 * @param config - Adapter configuration
 * @returns Result containing the adapter or an error
 * @example
 * const result = createAdapter({ model: 'claude-sonnet-4' });
 * if (result.ok) {
 *   const adapter = result.value;
 * }
 */
function createAdapter(config: AdapterConfig): Result<IModelAdapter, ConfigError> {
  // ...
}
```

## Getting Help

- **Discord:** Join our community for questions
- **Issues:** Search existing issues before creating new ones
- **Discussions:** Use GitHub Discussions for questions

## Next Steps

- [Agent Development](/nexus-agents/development/agent-development) - Create custom agents
- [Tool Development](/nexus-agents/development/tool-development) - Build MCP tools
- [Memory Development](/nexus-agents/development/memory-development) - Implement memory backends
