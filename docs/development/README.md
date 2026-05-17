---
title: Development Guide
description: How to contribute, extend, and develop with nexus-agents
tier: 2
keywords: [contributing, development, testing, coding, standards, debugging]
related_files:
  - CONTRIBUTING.md
  - docs/development/AGENT_DEVELOPMENT.md
  - docs/development/TOOL_DEVELOPMENT.md
  - docs/development/MEMORY_DEVELOPMENT.md
  - docs/guides/DEBUGGING_OBSERVABILITY.md
---

# Development Guide

**Tier 2 Hub** | Load for development tasks
**Contributing:** [CONTRIBUTING.md](../../CONTRIBUTING.md)

---

## Quick Navigation

| Topic              | Hub       | Deep Dive                                                          |
| ------------------ | --------- | ------------------------------------------------------------------ |
| Getting Started    | This file | [CONTRIBUTING.md](../../CONTRIBUTING.md)                           |
| Agent Development  | This file | [AGENT_DEVELOPMENT.md](./AGENT_DEVELOPMENT.md)                     |
| Tool Development   | This file | [TOOL_DEVELOPMENT.md](./TOOL_DEVELOPMENT.md)                       |
| Memory Development | This file | [MEMORY_DEVELOPMENT.md](./MEMORY_DEVELOPMENT.md)                   |
| CLI Delegation     | This file | [CLI_DELEGATION_GUIDE.md](./CLI_DELEGATION_GUIDE.md)               |
| Coding Standards   | This file | [CODING_STANDARDS.md](../../CODING_STANDARDS.md)                   |
| Debugging          | This file | [DEBUGGING_OBSERVABILITY.md](../guides/DEBUGGING_OBSERVABILITY.md) |

---

## Quick Start

```bash
# Clone repository
git clone https://github.com/nexus-substrate/nexus-agents.git
cd nexus-agents

# Install dependencies
pnpm install

# Run tests
pnpm test

# Start development
pnpm dev
```

---

## Development Workflow

### 1. Create Issue

```bash
gh issue create --title "feat: description" --label "enhancement"
```

### 2. Create Branch

```bash
git checkout -b feat/<issue>-short-description
```

### 3. Implement with TDD

```bash
# Write test first
pnpm test --watch

# Implement until tests pass
```

### 4. Run Quality Gates

```bash
pnpm lint          # Zero errors
pnpm typecheck     # Zero errors
pnpm test          # All pass
```

### 5. Create PR

```bash
git push -u origin HEAD
gh pr create --title "feat: description" --body "Closes #<issue>"
```

---

## Quality Gates

### Pre-Commit (Must Pass)

- [ ] `pnpm lint` - Zero errors, zero warnings
- [ ] `pnpm typecheck` - Zero errors
- [ ] `pnpm test` - All tests pass
- [ ] No file > 400 lines
- [ ] No function > 50 lines

### Pre-Merge

- [ ] All pre-commit gates
- [ ] Coverage ≥ 80%
- [ ] Security audit clean

---

## Code Standards Summary

### TypeScript

```typescript
// Use Result<T,E> for fallible operations
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

// Use unknown over any
function parse(input: unknown): Result<Data, ParseError> {}

// Use Zod for validation
const Schema = z.object({ name: z.string() });
```

### Naming

| Type      | Convention            | Example             |
| --------- | --------------------- | ------------------- |
| Interface | I prefix              | `IModelAdapter`     |
| Type      | PascalCase            | `CompletionRequest` |
| Function  | camelCase, verb-first | `createAdapter`     |
| Constant  | SCREAMING_SNAKE       | `MAX_RETRIES`       |
| File      | kebab-case            | `model-adapter.ts`  |

### File Structure

```typescript
// 1. Imports (external, then internal)
// 2. Types/Interfaces
// 3. Constants
// 4. Main export
// 5. Helper functions
```

---

## Common Tasks

### Adding a New Expert

```typescript
// 1. Define expert config
const config: ExpertConfig = {
  type: 'my-expert',
  prompt: 'You are an expert in...',
  tier: 'balanced',
};

// 2. Add to BUILT_IN_EXPERTS in expert-config.ts
// ExpertFactory.create('my-expert') will then find it
```

### Adding an MCP Tool

```typescript
server.tool(
  'tool_name',
  {
    param: z.string().describe('What this does'),
  },
  async (args) => {
    // Implementation
    return { content: [{ type: 'text', text: result }] };
  }
);
```

### Adding a Consensus Protocol

```typescript
class MyProtocol implements ICollaborationProtocol {
  readonly pattern = 'my-pattern';

  async execute(config, agents) {
    // Implementation
  }
}
```

---

## Testing

### Unit Tests

```typescript
import { describe, it, expect } from 'vitest';

describe('MyComponent', () => {
  it('should do something', () => {
    expect(result).toBe(expected);
  });
});
```

### Integration Tests

```typescript
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const [client, server] = InMemoryTransport.createLinkedPair();
```

### Run Specific Tests

```bash
pnpm test path/to/file.test.ts
pnpm test --grep "pattern"
```

---

## Debugging

### Enable Debug Logging

```bash
export NEXUS_LOG_LEVEL=debug
pnpm dev
```

### Routing Debug

```bash
nexus-agents routing-audit "task" --verbose
```

### See Also

- [DEBUGGING_OBSERVABILITY.md](../guides/DEBUGGING_OBSERVABILITY.md)
- [TROUBLESHOOTING.md](../TROUBLESHOOTING.md)

---

## Related Documents

- **Architecture:** [architecture/README.md](../architecture/README.md)
- **Full Standards:** [CODING_STANDARDS.md](../../CODING_STANDARDS.md)
- **API Reference:** [ENTRYPOINTS.md](../ENTRYPOINTS.md)
- **Research:** [RESEARCH_INDEX.md](../research/RESEARCH_INDEX.md)
