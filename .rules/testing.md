---
paths: ['**/*.test.ts', '**/*.spec.ts']
description: Test layout, Vitest patterns, mock conventions, integration vs unit
---

# Testing Rules

<!-- CANONICAL SOURCE: CODING_STANDARDS.md Section 8 -->

Quick reference for testing patterns. **Full documentation:** [CODING_STANDARDS.md](../../CODING_STANDARDS.md#8-testing-standards)

## Coverage Targets

| Type            | Target |
| --------------- | ------ |
| Line coverage   | ≥ 80%  |
| Branch coverage | ≥ 75%  |
| Critical paths  | 100%   |

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
