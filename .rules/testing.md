---
paths: ['**/*.test.ts', '**/*.spec.ts']
description: Test layout, Vitest patterns, mock conventions, integration vs unit
---

# Testing Rules

<!-- CANONICAL SOURCE: CODING_STANDARDS.md Section 8 -->

Quick reference for testing patterns. **Full documentation:** [CODING_STANDARDS.md](../../CODING_STANDARDS.md#8-testing-standards)

## Coverage Targets

**The enforced floors live in `packages/nexus-agents/vitest.config.ts`, and that
is the only place the numbers exist.** This file states the policy, not a copy of
them — a second copy is what drifted (#5142): these docs said 80/75 while CI
enforced 60/50, and nothing compared the two.

Policy, ratified 6/6:

- The floor is **measured actual coverage, less one point** — descriptive, not
  aspirational. A floor below actual cannot fail and measures nothing.
- It **ratchets up** as coverage improves.
- **Lowering it requires owner ratification**, and the PR must name the cause.
  Coverage is a ratio, so deleting dead, well-tested code lowers the percentage;
  #5098 removed 4,131 lines and would have tripped a naive ratchet. A gate that
  punishes deleting bloat teaches people to keep it.
- Critical paths: 100%.

As of the last measurement: 89.51% statements, 80.52% branches, 93.02%
functions, 90.45% lines, over 28,549 tests.

## Test Categories

1. **Unit tests** - Mock dependencies, test in isolation
2. **Integration tests** - Real dependencies, test boundaries
3. **Contract tests** - Verify interface compliance
4. **Security tests** - Fuzzing, injection, traversal

## MCP Testing Pattern

```typescript
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport);
await client.connect(clientTransport);

const result = await client.callTool({ name: 'tool', arguments: {} });
```

See [CODING_STANDARDS.md](../../CODING_STANDARDS.md#8-testing-standards) for full test structure.
