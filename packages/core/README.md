# @nexus-agents/core

Shared types, Result<T,E> pattern, error hierarchy, and structured logging for Nexus Agents.

## Installation

```bash
npm install @nexus-agents/core
```

## Usage

```typescript
import { Result, ok, err, BaseError, createLogger } from '@nexus-agents/core';

// Result pattern for error handling
function divide(a: number, b: number): Result<number, Error> {
  if (b === 0) return err(new Error('Division by zero'));
  return ok(a / b);
}

// Structured logging
const logger = createLogger({ name: 'my-app' });
logger.info('Operation complete', { duration: 100 });
```

## License

MIT
