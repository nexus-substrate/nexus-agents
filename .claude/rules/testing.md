---
paths: "**/*.test.ts"
---

# Testing Rules

## Coverage Targets

- Line coverage: ≥ 80%
- Branch coverage: ≥ 75%
- Critical paths (security, validation): 100%

## Test Structure

```typescript
describe('ComponentName', () => {
  describe('methodName', () => {
    it('should [expected behavior] when [condition]', () => {
      // Arrange
      const input = createTestInput();

      // Act
      const result = component.method(input);

      // Assert
      expect(result).toMatchExpectedOutput();
    });
  });
});
```

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
