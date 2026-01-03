# Interface Documentation

This directory contains detailed documentation for all Nexus Agents interfaces.

## Interfaces

| Interface                                          | Package            | Description                      |
| -------------------------------------------------- | ------------------ | -------------------------------- |
| [IModelAdapter](./model-adapter.md)                | @nexus-agents/core | Unified model provider interface |
| [IAgent](./agent.md)                               | @nexus-agents/core | Base agent interface             |
| [IWorkflowEngine](./workflow-engine.md)            | @nexus-agents/core | Workflow execution engine        |
| [ITool](./tool.md)                                 | @nexus-agents/core | MCP tool interface               |
| [IToolRegistry](./tool.md#itoolregistry-interface) | @nexus-agents/core | Tool management registry         |

## Design Principles

1. **Result Pattern**: All fallible operations return `Result<T, E>`
2. **Type Safety**: No `any` types, strict TypeScript
3. **Interface First**: Define contracts before implementations
4. **Documentation**: JSDoc on all public APIs

## Quick Start

```typescript
import {
  type IModelAdapter,
  type IAgent,
  type IWorkflowEngine,
  type ITool,
  type Result,
  ok,
  err,
} from '@nexus-agents/core';
```

## See Also

- [ARCHITECTURE.md](../../ARCHITECTURE.md) - System architecture
- [CODING_STANDARDS.md](../../CODING_STANDARDS.md) - Code standards
